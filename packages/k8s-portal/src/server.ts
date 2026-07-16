import { createServer } from "node:http";
import { json, readJson, routePath } from "../../core/src/http.js";
import { applyManifest, manifest, NamespaceStore, type NamespaceRequest } from "./namespaces.js";
import { TemplateStore, manifestFromTemplate, type NamespaceTemplateInput, type TemplateParams } from "./templates.js";
import { AuditLog } from "./audit.js";
import { validateManifest, type K8sManifest } from "./policyValidator.js";
import { UsageStore, buildReport, toCsv } from "./resourceReport.js";

const port = Number(process.env.PORT ?? 4050);
const store = new NamespaceStore(process.env.DATA_FILE ?? ".swissknife/namespaces.json");
const templateStore = new TemplateStore(process.env.TEMPLATES_FILE ?? ".swissknife/templates.json");
const auditLog = new AuditLog(process.env.AUDIT_FILE ?? ".swissknife/audit.log");
const usageStore = new UsageStore(process.env.USAGE_FILE ?? ".swissknife/usage.json");
const token = process.env.ADMIN_TOKEN;

function actorOf(request: import("node:http").IncomingMessage): string {
  return (request.headers["x-actor"] as string | undefined) ?? "anônimo";
}

createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://portal");
  try {
    if (request.method === "GET" && url.pathname === "/health") return json(response, 200, { status: "ok" });

    if (request.method === "GET" && url.pathname === "/namespaces") return json(response, 200, await store.list());
    if (request.method === "POST" && url.pathname === "/namespaces") {
      const input = await readJson<Omit<NamespaceRequest, "id" | "status" | "createdAt">>(request);
      const item = await store.create(input);
      await auditLog.record({ actor: actorOf(request), action: "namespace.create", target: item.name, details: input });
      return json(response, 201, item);
    }

    const nsParams = routePath("/namespaces/:id/:action", url.pathname);
    if (request.method === "POST" && nsParams) {
      if (!token || request.headers.authorization !== `Bearer ${token}`) return json(response, 401, { error: "Não autorizado" });
      if (!["approve", "reject"].includes(nsParams.action!)) return json(response, 400, { error: "Ação inválida" });
      const body = await readJson<{ reason?: string; apply?: boolean }>(request);
      let item = await store.update(nsParams.id!, nsParams.action === "approve" ? "approved" : "rejected", body.reason);
      await auditLog.record({ actor: actorOf(request), action: `namespace.${nsParams.action}`, target: item.name, details: body });
      if (nsParams.action === "approve" && body.apply) {
        await applyManifest(manifest(item));
        item = await store.update(nsParams.id!, "applied");
        await auditLog.record({ actor: actorOf(request), action: "namespace.applied", target: item.name });
      }
      return json(response, 200, { ...item, manifest: nsParams.action === "approve" ? manifest(item) : undefined });
    }

    // Templates
    if (request.method === "GET" && url.pathname === "/templates") return json(response, 200, await templateStore.list());
    if (request.method === "POST" && url.pathname === "/templates") {
      const input = await readJson<NamespaceTemplateInput>(request);
      const item = await templateStore.create(input);
      await auditLog.record({ actor: actorOf(request), action: "template.create", target: item.name, details: input });
      return json(response, 201, item);
    }
    const templateApplyParams = routePath("/templates/:id/namespaces", url.pathname);
    if (request.method === "POST" && templateApplyParams) {
      const template = await templateStore.get(templateApplyParams.id!);
      if (!template) return json(response, 404, { error: "Template não encontrado" });
      const params = await readJson<TemplateParams>(request);
      const generatedManifest = manifestFromTemplate(template, params);
      const item = await store.create({
        name: params.name,
        owner: params.owner,
        team: params.team,
        cpu: params.cpu ?? template.defaultCpu,
        memory: params.memory ?? template.defaultMemory
      });
      await auditLog.record({ actor: actorOf(request), action: "template.apply", target: item.name, details: { templateId: template.id, params } });
      return json(response, 201, { ...item, manifest: generatedManifest });
    }

    // Audit
    if (request.method === "GET" && url.pathname === "/audit") {
      const query = {
        actor: url.searchParams.get("actor") ?? undefined,
        action: url.searchParams.get("action") ?? undefined,
        target: url.searchParams.get("target") ?? undefined,
        since: url.searchParams.get("since") ?? undefined
      };
      return json(response, 200, await auditLog.query(query));
    }

    // Policy validation
    if (request.method === "POST" && url.pathname === "/policies/validate") {
      const body = await readJson<{ manifest: K8sManifest; requiredLabels?: string[] }>(request);
      const violations = validateManifest(body.manifest, body.requiredLabels);
      return json(response, 200, { valid: violations.length === 0, violations });
    }

    // Usage recording + report
    if (request.method === "POST" && url.pathname === "/usage") {
      const body = await readJson<{ namespace: string; cpuUsed: number; memoryUsedGi: number }>(request);
      const record = await usageStore.record(body);
      return json(response, 201, record);
    }
    if (request.method === "GET" && url.pathname === "/reports/usage") {
      const [namespaces, usage] = await Promise.all([store.list(), usageStore.list()]);
      const report = buildReport(namespaces, usage);
      const format = url.searchParams.get("format") ?? "json";
      if (format === "csv") {
        const body = toCsv(report);
        response.writeHead(200, { "content-type": "text/csv; charset=utf-8", "content-length": Buffer.byteLength(body) });
        return response.end(body);
      }
      return json(response, 200, report);
    }

    return json(response, 404, { error: "Rota não encontrada" });
  } catch (error) { return json(response, 400, { error: error instanceof Error ? error.message : String(error) }); }
}).listen(port, () => console.log(`Portal Kubernetes em http://localhost:${port}`));
