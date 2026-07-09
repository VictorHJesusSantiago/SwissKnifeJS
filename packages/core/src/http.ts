import type { IncomingMessage, ServerResponse } from "node:http";

export async function readBody(request: IncomingMessage, limit = 1_048_576): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > limit) throw new Error("Corpo da requisição excede o limite");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

export async function readJson<T>(request: IncomingMessage, limit?: number): Promise<T> {
  const body = await readBody(request, limit);
  try {
    return JSON.parse(body.toString("utf8")) as T;
  } catch {
    throw new Error("JSON inválido");
  }
}

export function json(response: ServerResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "access-control-allow-origin": "*"
  });
  response.end(body);
}

export function routePath(pattern: string, pathname: string): Record<string, string> | undefined {
  const names: string[] = [];
  const expression = pattern
    .split("/")
    .map((part) => part.startsWith(":") ? (names.push(part.slice(1)), "([^/]+)") : escapeRegex(part))
    .join("/");
  const match = pathname.match(new RegExp(`^${expression}/?$`));
  if (!match) return undefined;
  return Object.fromEntries(names.map((name, index) => [name, decodeURIComponent(match[index + 1]!)]));
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
