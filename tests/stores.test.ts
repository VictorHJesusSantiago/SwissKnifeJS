import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { LogStore } from "../packages/log-aggregator/src/store.js";
import { NamespaceStore, manifest } from "../packages/k8s-portal/src/namespaces.js";
import { SnippetStore } from "../packages/snippet-manager/src/store.js";
describe("armazenamento local", () => {
  it("ingere e consulta logs", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sk-logs-"));
    const store = new LogStore(join(dir, "logs.ndjson"));
    await store.ingest({ level: "error", service: "api", message: "falhou" });
    expect(await store.query({ service: "api" })).toHaveLength(1);
    expect(await readFile(join(dir, "logs.ndjson"), "utf8")).toContain('"service":"api"');
  });
  it("persiste solicitação e gera manifesto Kubernetes", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sk-k8s-"));
    const store = new NamespaceStore(join(dir, "namespaces.json"));
    const request = await store.create({ name: "payments", owner: "ana", team: "pay", cpu: "2", memory: "4Gi" });
    expect(manifest(request)).toContain("kind: ResourceQuota");
    expect((await store.update(request.id, "approved")).status).toBe("approved");
  });
  it("cria, atualiza e remove snippets", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sk-snippets-"));
    const store = new SnippetStore(join(dir, "snippets.json"));
    const created = await store.save({ title: "Fetch", language: "ts", code: "fetch(url)", tags: ["http"] });
    expect((await store.list())[0]?.title).toBe("Fetch");
    await store.remove(created.id);
    expect(await store.list()).toEqual([]);
  });
});
