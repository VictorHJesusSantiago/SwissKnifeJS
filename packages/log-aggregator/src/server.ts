import { createServer } from "node:http";
import { json, readJson } from "../../core/src/http.js";
import { LogStore, type LogEntry } from "./store.js";
import { parseLogLine, parseLogLines, detectFormat } from "./logParsers.js";
import { AlertEngine, type AlertRule } from "./alerting.js";
import { rotateIfNeeded } from "./rotation.js";
import { runQuery } from "./queryDsl.js";
import { SavedQueryStore } from "./savedQueries.js";

const port = Number(process.env.PORT ?? 4080);
const dataFile = process.env.DATA_FILE ?? ".swissknife/logs.ndjson";
const store = new LogStore(dataFile);
const alertEngine = new AlertEngine(process.env.ALERTS_FILE ?? ".swissknife/alert-rules.json");
const savedQueries = new SavedQueryStore(process.env.SAVED_QUERIES_FILE ?? ".swissknife/saved-queries.json");
await alertEngine.load();

createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://logs");
  try {
    if (request.method === "GET" && url.pathname === "/health") return json(response, 200, { status: "ok" });

    // Ingestão estruturada (compatibilidade com o formato original)
    if (request.method === "POST" && url.pathname === "/logs") {
      const entry = await store.ingest(await readJson<Omit<LogEntry, "id" | "timestamp">>(request));
      await alertEngine.evaluate(entry);
      await rotateIfNeeded(dataFile);
      return json(response, 201, entry);
    }

    if (request.method === "GET" && url.pathname === "/logs")
      return json(response, 200, await store.query({
        service: url.searchParams.get("service") ?? undefined, level: url.searchParams.get("level") ?? undefined,
        search: url.searchParams.get("search") ?? undefined, traceId: url.searchParams.get("traceId") ?? undefined,
        limit: Math.min(1000, Number(url.searchParams.get("limit") ?? 100))
      }));

    // Ingestão de texto bruto com detecção automática de formato (JSON/syslog/apache)
    if (request.method === "POST" && url.pathname === "/logs/parse") {
      const body = await readJson<{ text?: string; lines?: string[] }>(request);
      const rawLines = body.lines ?? (body.text ? body.text.split("\n") : []);
      const format = detectFormat(rawLines);
      const entries: LogEntry[] = [];
      for (const line of rawLines) {
        if (!line.trim()) continue;
        const parsed = parseLogLine(line);
        const entry = await store.ingest({
          level: (["debug", "info", "warn", "error"].includes(parsed.level ?? "") ? parsed.level : "info") as LogEntry["level"],
          service: parsed.service ?? "unknown",
          message: parsed.message,
          timestamp: parsed.timestamp,
          metadata: { format: parsed.format, ...parsed.fields }
        } as Omit<LogEntry, "id" | "timestamp"> & { timestamp?: string });
        await alertEngine.evaluate(entry);
        entries.push(entry);
      }
      await rotateIfNeeded(dataFile);
      return json(response, 201, { detectedFormat: format, count: entries.length, entries });
    }

    // Busca via query DSL: campo:valor AND outro:valor OR "frase", faixas de tempo, wildcards
    if (request.method === "GET" && url.pathname === "/logs/search") {
      const q = url.searchParams.get("q") ?? "";
      const limit = Math.min(1000, Number(url.searchParams.get("limit") ?? 100));
      const all = await store.query({ limit: 100000 });
      return json(response, 200, runQuery(q, all).slice(0, limit));
    }

    // Regras de alerta
    if (request.method === "POST" && url.pathname === "/alerts")
      return json(response, 201, await alertEngine.addRule(await readJson<Omit<AlertRule, "id">>(request)));
    if (request.method === "GET" && url.pathname === "/alerts")
      return json(response, 200, alertEngine.listRules());
    if (request.method === "DELETE" && url.pathname.startsWith("/alerts/")) {
      const id = url.pathname.slice("/alerts/".length);
      const removed = await alertEngine.removeRule(id);
      return json(response, removed ? 200 : 404, { removed });
    }

    // Rotação/compactação manual
    if (request.method === "POST" && url.pathname === "/rotate") {
      const maxSizeBytes = url.searchParams.get("maxSizeBytes");
      const maxAgeMs = url.searchParams.get("maxAgeMs");
      return json(response, 200, await rotateIfNeeded(dataFile, {
        maxSizeBytes: maxSizeBytes ? Number(maxSizeBytes) : undefined,
        maxAgeMs: maxAgeMs ? Number(maxAgeMs) : undefined,
        maxArchives: 0
      }));
    }

    // Filtros salvos (queries nomeadas reutilizáveis)
    if (request.method === "POST" && url.pathname === "/saved-queries")
      return json(response, 201, await savedQueries.save(await readJson<{ name: string; query: string }>(request)));
    if (request.method === "GET" && url.pathname === "/saved-queries")
      return json(response, 200, await savedQueries.list());
    if (request.method === "GET" && url.pathname.startsWith("/saved-queries/") && url.pathname.endsWith("/run")) {
      const name = decodeURIComponent(url.pathname.slice("/saved-queries/".length, -"/run".length));
      const saved = await savedQueries.get(name);
      if (!saved) return json(response, 404, { error: "query salva não encontrada" });
      const all = await store.query({ limit: 100000 });
      return json(response, 200, runQuery(saved.query, all));
    }
    if (request.method === "DELETE" && url.pathname.startsWith("/saved-queries/")) {
      const id = url.pathname.slice("/saved-queries/".length);
      const removed = await savedQueries.remove(id);
      return json(response, removed ? 200 : 404, { removed });
    }

    return json(response, 404, { error: "Rota não encontrada" });
  } catch (error) { return json(response, 400, { error: error instanceof Error ? error.message : String(error) }); }
}).listen(port, () => console.log(`Agregador de logs em http://localhost:${port}`));
