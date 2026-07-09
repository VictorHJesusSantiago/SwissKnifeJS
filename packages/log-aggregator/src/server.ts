import { createServer } from "node:http";
import { json, readJson } from "../../core/src/http.js";
import { LogStore, type LogEntry } from "./store.js";
const port = Number(process.env.PORT ?? 4080);
const store = new LogStore(process.env.DATA_FILE ?? ".swissknife/logs.ndjson");
createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://logs");
  try {
    if (request.method === "GET" && url.pathname === "/health") return json(response, 200, { status: "ok" });
    if (request.method === "POST" && url.pathname === "/logs")
      return json(response, 201, await store.ingest(await readJson<Omit<LogEntry, "id" | "timestamp">>(request)));
    if (request.method === "GET" && url.pathname === "/logs") return json(response, 200, await store.query({
      service: url.searchParams.get("service") ?? undefined, level: url.searchParams.get("level") ?? undefined,
      search: url.searchParams.get("search") ?? undefined, traceId: url.searchParams.get("traceId") ?? undefined,
      limit: Math.min(1000, Number(url.searchParams.get("limit") ?? 100))
    }));
    return json(response, 404, { error: "Rota não encontrada" });
  } catch (error) { return json(response, 400, { error: error instanceof Error ? error.message : String(error) }); }
}).listen(port, () => console.log(`Agregador de logs em http://localhost:${port}`));
