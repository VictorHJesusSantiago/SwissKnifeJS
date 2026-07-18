import { appendFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { createServer, type Server, type ServerResponse } from "node:http";
import { join } from "node:path";
import { readBody } from "../../core/src/http.js";
import { createMockHandler } from "./server.js";
import type { OpenApi } from "../../openapi-docgen/src/spec.js";

/**
 * Formato de gravação (NDJSON — uma interação por linha) usado pelo recorder do
 * openapi-mock. Cada linha é um objeto `RecordedInteraction`. Este formato é
 * consumido por `packages/contract-tester/src/mockIntegration.ts` para gerar
 * contratos "consumer-driven" a partir de interações reais capturadas contra o mock.
 */
export interface RecordedInteraction {
  timestamp: string;
  method: string;
  path: string;
  requestHeaders: Record<string, string>;
  requestBody: unknown;
  responseStatus: number;
  responseHeaders: Record<string, string>;
  responseBody: unknown;
  operationId?: string;
}

function headersToRecord(headers: Record<string, string | string[] | undefined>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    result[key] = Array.isArray(value) ? value.join(", ") : value;
  }
  return result;
}

function parseJsonBody(buffer: Buffer): unknown {
  if (buffer.length === 0) return undefined;
  try {
    return JSON.parse(buffer.toString("utf8"));
  } catch {
    return buffer.toString("utf8");
  }
}

/**
 * Cria um servidor mock que grava cada interação (requisição + resposta) em
 * formato NDJSON no arquivo `outputPath`, além de responder normalmente com
 * base na especificação OpenAPI (mesmo comportamento de `createMockServer`).
 */
export function createRecordingMockServer(spec: OpenApi, outputPath: string): Server {
  const handler = createMockHandler(spec);
  return createServer((request, response) => {
    void (async () => {
      const requestBodyBuffer = await readBody(request).catch(() => Buffer.alloc(0));
      const chunks: Buffer[] = [];
      const originalEnd = response.end.bind(response) as ServerResponse["end"];
      response.end = ((...args: Parameters<ServerResponse["end"]>) => {
        const [chunk] = args;
        if (chunk && typeof chunk !== "function") {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
        }
        const record: RecordedInteraction = {
          timestamp: new Date().toISOString(),
          method: (request.method ?? "GET").toUpperCase(),
          path: request.url ?? "/",
          requestHeaders: headersToRecord(request.headers as Record<string, string | string[] | undefined>),
          requestBody: parseJsonBody(requestBodyBuffer),
          responseStatus: response.statusCode,
          responseHeaders: headersToRecord(response.getHeaders() as Record<string, string | string[] | undefined>),
          responseBody: parseJsonBody(Buffer.concat(chunks)),
          operationId: response.getHeader("x-mock-operation")?.toString()
        };
        void appendFile(outputPath, `${JSON.stringify(record)}\n`, "utf8");
        return originalEnd(...args);
      }) as ServerResponse["end"];
      handler(request, response);
    })();
  });
}

/**
 * Modo "record" como proxy reverso: encaminha cada requisição recebida para um
 * backend real (`target`), devolve a resposta real ao cliente e grava o par
 * requisição/resposta em disco (um arquivo JSON por interação em `outDir`).
 * Essas gravações podem depois ser convertidas em cenários de mock com
 * `scenariosFromRecordings` / `generateScenarioFile`.
 */
export interface ProxyRecorderOptions {
  /** URL base do backend real a ser espelhado, ex: http://localhost:3000. */
  target: string;
  /** Diretório onde as gravações (JSON) serão salvas. */
  outDir: string;
}

export interface ProxyRecording {
  method: string;
  path: string;
  requestHeaders: Record<string, string>;
  requestBody?: string;
  status: number;
  responseHeaders: Record<string, string>;
  responseBody: string;
  recordedAt: string;
}

function fetchHeadersToObject(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => { result[key] = value; });
  return result;
}

function sanitizeFileName(method: string, path: string): string {
  const slug = `${method}-${path}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return `${slug || "root"}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`;
}

export function createProxyRecorderServer(options: ProxyRecorderOptions): Server {
  const targetUrl = options.target.replace(/\/$/, "");
  return createServer((request, response) => {
    void handleProxyRecordedRequest(request, response, targetUrl, options.outDir);
  });
}

async function handleProxyRecordedRequest(
  request: import("node:http").IncomingMessage,
  response: ServerResponse,
  targetUrl: string,
  outDir: string
): Promise<void> {
  const method = request.method ?? "GET";
  const path = request.url ?? "/";
  const requestHeaders: Record<string, string> = {};
  for (const [key, value] of Object.entries(request.headers)) {
    if (typeof value === "string" && !["host", "connection", "content-length"].includes(key)) requestHeaders[key] = value;
  }
  const bodyBuffer = method === "GET" || method === "HEAD" ? Buffer.alloc(0) : await readBody(request);

  const upstream = await fetch(`${targetUrl}${path}`, {
    method,
    headers: requestHeaders,
    body: bodyBuffer.length ? new Uint8Array(bodyBuffer) : undefined
  });
  const responseBodyBuffer = Buffer.from(await upstream.arrayBuffer());
  const responseHeaders = fetchHeadersToObject(upstream.headers);

  const recording: ProxyRecording = {
    method,
    path,
    requestHeaders,
    requestBody: bodyBuffer.length ? bodyBuffer.toString("utf8") : undefined,
    status: upstream.status,
    responseHeaders,
    responseBody: responseBodyBuffer.toString("utf8"),
    recordedAt: new Date().toISOString()
  };
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, sanitizeFileName(method, path)), JSON.stringify(recording, null, 2), "utf8");

  response.writeHead(upstream.status, responseHeaders);
  response.end(responseBodyBuffer);
}

/** Lê todas as gravações (modo proxy) de um diretório. */
export async function loadProxyRecordings(dir: string): Promise<ProxyRecording[]> {
  const entries = await readdir(dir).catch(() => [] as string[]);
  const files = entries.filter((entry) => entry.endsWith(".json"));
  return Promise.all(files.map(async (file) => JSON.parse(await readFile(join(dir, file), "utf8")) as ProxyRecording));
}

export interface MockScenario {
  method: string;
  path: string;
  status: number;
  body: unknown;
}

function parseJsonSafe(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Converte gravações (modo proxy) em cenários de mock simples (método, caminho, status, corpo). */
export function scenariosFromRecordings(recordings: ProxyRecording[]): MockScenario[] {
  return recordings.map((recording) => ({
    method: recording.method.toUpperCase(),
    path: recording.path,
    status: recording.status,
    body: parseJsonSafe(recording.responseBody)
  }));
}

/** Gera um arquivo de cenários a partir de um diretório de gravações (modo proxy). */
export async function generateScenarioFile(recordingsDir: string, outFile: string): Promise<MockScenario[]> {
  const recordings = await loadProxyRecordings(recordingsDir);
  const scenarios = scenariosFromRecordings(recordings);
  await writeFile(outFile, JSON.stringify(scenarios, null, 2), "utf8");
  return scenarios;
}

/** Carrega um arquivo de cenários previamente gerado (via `generateScenarioFile`). */
export async function loadScenarioFile(path: string): Promise<MockScenario[]> {
  return JSON.parse(await readFile(path, "utf8")) as MockScenario[];
}
