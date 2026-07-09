import { createServer } from "node:http";
import { json, readJson, routePath } from "../../core/src/http.js";
import { applyManifest, manifest, NamespaceStore, type NamespaceRequest } from "./namespaces.js";
const port = Number(process.env.PORT ?? 4050);
const store = new NamespaceStore(process.env.DATA_FILE ?? ".swissknife/namespaces.json");
const token = process.env.ADMIN_TOKEN;

createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://portal");
  try {
    if (request.method === "GET" && url.pathname === "/health") return json(response, 200, { status: "ok" });
    if (request.method === "GET" && url.pathname === "/namespaces") return json(response, 200, await store.list());
    if (request.method === "POST" && url.pathname === "/namespaces") {
      const input = await readJson<Omit<NamespaceRequest, "id" | "status" | "createdAt">>(request);
      return json(response, 201, await store.create(input));
    }
    const params = routePath("/namespaces/:id/:action", url.pathname);
    if (request.method === "POST" && params) {
      if (!token || request.headers.authorization !== `Bearer ${token}`) return json(response, 401, { error: "Não autorizado" });
      if (!["approve", "reject"].includes(params.action!)) return json(response, 400, { error: "Ação inválida" });
      const body = await readJson<{ reason?: string; apply?: boolean }>(request);
      let item = await store.update(params.id!, params.action === "approve" ? "approved" : "rejected", body.reason);
      if (params.action === "approve" && body.apply) {
        await applyManifest(manifest(item));
        item = await store.update(params.id!, "applied");
      }
      return json(response, 200, { ...item, manifest: params.action === "approve" ? manifest(item) : undefined });
    }
    return json(response, 404, { error: "Rota não encontrada" });
  } catch (error) { return json(response, 400, { error: error instanceof Error ? error.message : String(error) }); }
}).listen(port, () => console.log(`Portal Kubernetes em http://localhost:${port}`));
