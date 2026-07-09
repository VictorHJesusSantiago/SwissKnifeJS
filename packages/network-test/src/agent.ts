import { createServer } from "node:http";
import { json, readBody } from "../../core/src/http.js";

export function startAgent(port: number): void {
  createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://agent");
    if (request.method === "GET" && url.pathname === "/ping") {
      response.writeHead(200, { "content-type": "application/octet-stream" }); return response.end("pong");
    }
    if (request.method === "GET" && url.pathname === "/download") {
      const bytes = Math.min(50_000_000, Math.max(1, Number(url.searchParams.get("bytes") ?? 1_000_000)));
      response.writeHead(200, { "content-type": "application/octet-stream", "content-length": bytes });
      return response.end(Buffer.alloc(bytes, 0x5a));
    }
    if (request.method === "POST" && url.pathname === "/upload") {
      const body = await readBody(request, 50_000_000);
      return json(response, 200, { received: body.length });
    }
    return json(response, 404, { error: "Rota não encontrada" });
  }).listen(port, () => console.log(`Agente de rede na porta ${port}`));
}
