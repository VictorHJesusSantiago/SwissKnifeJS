import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { TemplateStore, manifestFromTemplate } from "../packages/k8s-portal/src/templates.js";
import { AuditLog } from "../packages/k8s-portal/src/audit.js";
import { validateManifest } from "../packages/k8s-portal/src/policyValidator.js";
import { UsageStore, buildReport, toCsv } from "../packages/k8s-portal/src/resourceReport.js";
import { NamespaceStore } from "../packages/k8s-portal/src/namespaces.js";

describe("templates de namespace", () => {
  it("cria template e gera manifesto a partir de parâmetros", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sk-templates-"));
    const store = new TemplateStore(join(dir, "templates.json"));
    const template = await store.create({
      name: "standard",
      defaultCpu: "1",
      defaultMemory: "2Gi",
      defaultLimitsCpu: "2",
      defaultLimitsMemory: "4Gi",
      requiredLabels: ["portal.swissknife/team"],
      networkPolicies: [{ direction: "ingress", allowFrom: "gateway" }]
    });
    expect((await store.list())).toHaveLength(1);
    const rendered = manifestFromTemplate(template, { name: "payments", owner: "ana", team: "pay" });
    expect(rendered).toContain("kind: Namespace");
    expect(rendered).toContain("kind: ResourceQuota");
    expect(rendered).toContain("kind: NetworkPolicy");
    expect(rendered).toContain("requests.cpu: 1");
  });

  it("rejeita template duplicado e nome inválido", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sk-templates-"));
    const store = new TemplateStore(join(dir, "templates.json"));
    const template = await store.create({
      name: "standard", defaultCpu: "1", defaultMemory: "2Gi", defaultLimitsCpu: "2", defaultLimitsMemory: "4Gi",
      requiredLabels: [], networkPolicies: []
    });
    await expect(store.create({ ...template, name: "standard" } as any)).rejects.toThrow();
    expect(() => manifestFromTemplate(template, { name: "Invalid_Name", owner: "a", team: "b" })).toThrow();
  });
});

describe("auditoria local", () => {
  it("registra e consulta histórico", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sk-audit-"));
    const log = new AuditLog(join(dir, "audit.log"));
    await log.record({ actor: "ana", action: "namespace.create", target: "payments" });
    await log.record({ actor: "bob", action: "namespace.create", target: "billing" });
    const all = await log.query();
    expect(all).toHaveLength(2);
    expect(await log.query({ actor: "ana" })).toHaveLength(1);
    expect(await log.query({ target: "billing" })).toHaveLength(1);
  });

  it("retorna lista vazia quando arquivo não existe", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sk-audit-empty-"));
    const log = new AuditLog(join(dir, "missing.log"));
    expect(await log.query()).toEqual([]);
  });
});

describe("validação de políticas", () => {
  it("detecta violações de labels, privileged e recursos", () => {
    const violations = validateManifest({
      kind: "Deployment",
      metadata: { labels: {} },
      spec: { containers: [{ name: "app", securityContext: { privileged: true } }] }
    });
    expect(violations.some((v) => v.rule === "require-labels")).toBe(true);
    expect(violations.some((v) => v.rule === "no-privileged")).toBe(true);
    expect(violations.some((v) => v.rule === "require-requests")).toBe(true);
    expect(violations.some((v) => v.rule === "require-limits")).toBe(true);
  });

  it("aprova manifesto válido", () => {
    const violations = validateManifest({
      kind: "Deployment",
      metadata: { labels: { "portal.swissknife/team": "pay", "portal.swissknife/owner": "ana" } },
      spec: { containers: [{ name: "app", resources: { requests: { cpu: "100m", memory: "128Mi" }, limits: { cpu: "200m", memory: "256Mi" } } }] }
    });
    expect(violations).toEqual([]);
  });
});

describe("relatório de uso de recursos", () => {
  it("agrega uso registrado contra quota e exporta CSV", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sk-usage-"));
    const nsStore = new NamespaceStore(join(dir, "namespaces.json"));
    const usageStore = new UsageStore(join(dir, "usage.json"));
    const item = await nsStore.create({ name: "payments", owner: "ana", team: "pay", cpu: "2", memory: "4Gi" });
    await nsStore.update(item.id, "approved");
    await usageStore.record({ namespace: "payments", cpuUsed: 1, memoryUsedGi: 2 });
    const report = buildReport(await nsStore.list(), await usageStore.list());
    expect(report).toHaveLength(1);
    expect(report[0]!.cpuUtilizationPct).toBe(50);
    const csv = toCsv(report);
    expect(csv).toContain("namespace,status,cpuQuota");
    expect(csv).toContain("payments,approved");
  });

  it("ignora namespaces pendentes/rejeitados no relatório", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sk-usage-pending-"));
    const nsStore = new NamespaceStore(join(dir, "namespaces.json"));
    await nsStore.create({ name: "billing", owner: "bob", team: "fin", cpu: "1", memory: "1Gi" });
    const report = buildReport(await nsStore.list(), []);
    expect(report).toEqual([]);
  });
});
