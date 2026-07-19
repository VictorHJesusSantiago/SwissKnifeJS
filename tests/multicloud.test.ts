import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { diffConfigs, normalizeTags, type CloudConfig } from "../packages/multicloud-cli/src/diffConfig.js";
import {
  detectProvider,
  findAction,
  translateCommand,
  registerCommandMapping,
} from "../packages/multicloud-cli/src/commandTranslator.js";
import { clearCache, getCached, setCached, withCache } from "../packages/multicloud-cli/src/cache.js";
import { isDryRun, runWithDryRun } from "../packages/multicloud-cli/src/dryRun.js";

describe("diffConfig", () => {
  it("normaliza tags da AWS (array Key/Value)", () => {
    const config: CloudConfig = { provider: "aws", Tags: [{ Key: "env", Value: "prod" }] };
    expect(normalizeTags(config)).toEqual({ env: "prod" });
  });

  it("normaliza labels do GCP (objeto chave/valor)", () => {
    const config: CloudConfig = { provider: "gcp", labels: { env: "prod" } };
    expect(normalizeTags(config)).toEqual({ env: "prod" });
  });

  it("normaliza Tags do Azure (objeto chave/valor)", () => {
    const config: CloudConfig = { provider: "azure", Tags: { env: "prod" } };
    expect(normalizeTags(config)).toEqual({ env: "prod" });
  });

  it("considera equivalentes configs com mesma tag em formatos diferentes de provedor", () => {
    const aws: CloudConfig = { provider: "aws", name: "web", region: "us-east-1", Tags: [{ Key: "env", Value: "prod" }] };
    const gcp: CloudConfig = { provider: "gcp", name: "web", region: "us-east-1", labels: { env: "prod" } };
    const diff = diffConfigs(aws, gcp);
    expect(diff.equivalent).toBe(true);
  });

  it("detecta tags adicionadas, removidas e alteradas entre provedores diferentes", () => {
    const aws: CloudConfig = { provider: "aws", Tags: [{ Key: "env", Value: "prod" }, { Key: "old", Value: "1" }] };
    const azure: CloudConfig = { provider: "azure", Tags: { env: "staging", novo: "x" } };
    const diff = diffConfigs(aws, azure);
    expect(diff.tags.changed).toEqual({ env: { from: "prod", to: "staging" } });
    expect(diff.tags.added).toEqual({ novo: "x" });
    expect(diff.tags.removed).toEqual({ old: "1" });
    expect(diff.equivalent).toBe(false);
  });

  it("detecta diferenças em campos comuns como region", () => {
    const aws: CloudConfig = { provider: "aws", region: "us-east-1" };
    const gcp: CloudConfig = { provider: "gcp", region: "europe-west1" };
    const diff = diffConfigs(aws, gcp);
    expect(diff.fields).toEqual([{ field: "region", from: "us-east-1", to: "europe-west1" }]);
  });
});

describe("commandTranslator", () => {
  it("detecta o provedor pelo binário do comando", () => {
    expect(detectProvider("aws s3 ls")).toBe("aws");
    expect(detectProvider("az vm list -d")).toBe("azure");
    expect(detectProvider("gcloud compute instances list")).toBe("gcp");
    expect(detectProvider("kubectl get pods")).toBeUndefined();
  });

  it("encontra a ação correspondente a um comando conhecido", () => {
    expect(findAction("aws s3 ls", "aws")).toBe("list-buckets");
    expect(findAction("az vm list -d", "azure")).toBe("list-instances");
  });

  it("traduz um comando AWS para os demais provedores", () => {
    const result = translateCommand("aws s3 ls");
    expect(result.action).toBe("list-buckets");
    expect(result.translations.azure).toBe("az storage account list");
    expect(result.translations.gcp).toBe("gcloud storage buckets list");
    expect(result.translations.aws).toBeUndefined();
  });

  it("traduz apenas para os provedores solicitados em --to", () => {
    const result = translateCommand("aws ec2 describe-instances", ["gcp"]);
    expect(Object.keys(result.translations)).toEqual(["gcp"]);
    expect(result.translations.gcp).toBe("gcloud compute instances list");
  });

  it("lança erro para comando não mapeado", () => {
    expect(() => translateCommand("aws lambda list-functions")).toThrow();
  });

  it("permite registrar novos mapeamentos de comando", () => {
    registerCommandMapping("list-databases", {
      aws: "aws rds describe-db-instances",
      azure: "az sql db list",
      gcp: "gcloud sql instances list",
    });
    const result = translateCommand("aws rds describe-db-instances");
    expect(result.translations.gcp).toBe("gcloud sql instances list");
  });
});

describe("cache", () => {
  let cachePath: string;
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "multicloud-cache-"));
    cachePath = join(dir, "cache.json");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("retorna undefined quando não há entrada em cache", async () => {
    expect(await getCached("missing", { path: cachePath })).toBeUndefined();
  });

  it("grava e lê um valor em cache dentro do TTL", async () => {
    await setCached("key", { hello: "world" }, { path: cachePath, ttlMs: 60_000 });
    expect(await getCached("key", { path: cachePath })).toEqual({ hello: "world" });
  });

  it("expira entradas após o TTL", async () => {
    await setCached("key", "valor", { path: cachePath, ttlMs: -1 });
    expect(await getCached("key", { path: cachePath })).toBeUndefined();
  });

  it("withCache evita recomputar quando já há valor em cache válido", async () => {
    let calls = 0;
    const compute = async () => { calls += 1; return calls; };
    const first = await withCache("op", { path: cachePath, ttlMs: 60_000 }, compute);
    const second = await withCache("op", { path: cachePath, ttlMs: 60_000 }, compute);
    expect(first).toEqual({ value: 1, fromCache: false });
    expect(second).toEqual({ value: 1, fromCache: true });
    expect(calls).toBe(1);
  });

  it("clearCache remove todas as entradas", async () => {
    await setCached("key", "valor", { path: cachePath, ttlMs: 60_000 });
    await clearCache(cachePath);
    expect(await getCached("key", { path: cachePath })).toBeUndefined();
  });
});

describe("dryRun", () => {
  it("identifica a flag --dry-run vinda do parseArgs", () => {
    expect(isDryRun({ _: [], "dry-run": true })).toBe(true);
    expect(isDryRun({ _: [] })).toBe(false);
  });

  it("não executa a ação quando --dry-run está presente", async () => {
    let executed = false;
    const result = await runWithDryRun(
      { _: [], "dry-run": true },
      { action: "delete-vm", details: { id: "i-123" } },
      async () => { executed = true; return "resultado real"; }
    );
    expect(executed).toBe(false);
    expect(result).toEqual({ dryRun: true, action: "delete-vm", details: { id: "i-123" } });
  });

  it("executa a ação normalmente quando --dry-run não está presente", async () => {
    let executed = false;
    const result = await runWithDryRun({ _: [] }, { action: "delete-vm" }, async () => {
      executed = true;
      return "resultado real";
    });
    expect(executed).toBe(true);
    expect(result).toBe("resultado real");
  });
});
