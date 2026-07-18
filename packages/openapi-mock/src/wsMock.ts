import type { Server } from "node:http";
import { readFile } from "node:fs/promises";
import { WebSocketServer, WebSocket, type RawData } from "ws";

/** Uma regra de resposta roteirizada (scripted) para uma mensagem recebida. */
export interface WsScriptedResponse {
  /** Texto exato a casar com a mensagem recebida. Ignorado se `match` for informado. */
  when?: string;
  /** Expressão regular (como string) a casar com a mensagem recebida. */
  match?: string;
  /** Mensagem(ns) a enviar de volta, na ordem, quando a regra casar. */
  reply: unknown | unknown[];
  /** Atraso em milissegundos antes de enviar a resposta. */
  delayMs?: number;
}

export interface WsEndpointConfig {
  /** Caminho do endpoint WebSocket, ex: "/ws/chat". */
  path: string;
  /** Mensagens enviadas automaticamente assim que o cliente conecta. */
  onOpen?: unknown[];
  /** Regras roteirizadas de requisição/resposta. */
  scripted?: WsScriptedResponse[];
}

export type WsMockConfig = WsEndpointConfig[];

function send(socket: WebSocket, payload: unknown): void {
  const text = typeof payload === "string" ? payload : JSON.stringify(payload);
  socket.send(text);
}

function messageText(data: RawData): string {
  if (typeof data === "string") return data;
  if (Buffer.isBuffer(data)) return data.toString("utf8");
  if (Array.isArray(data)) return Buffer.concat(data).toString("utf8");
  return Buffer.from(data as ArrayBuffer).toString("utf8");
}

function findMatchingRule(rules: WsScriptedResponse[] | undefined, text: string): WsScriptedResponse | undefined {
  if (!rules) return undefined;
  return rules.find((rule) => {
    if (rule.when !== undefined) return rule.when === text;
    if (rule.match !== undefined) return new RegExp(rule.match).test(text);
    return false;
  });
}

async function replyTo(socket: WebSocket, rule: WsScriptedResponse): Promise<void> {
  const replies = Array.isArray(rule.reply) ? rule.reply : [rule.reply];
  if (rule.delayMs) await new Promise((resolve) => setTimeout(resolve, rule.delayMs));
  for (const reply of replies) if (socket.readyState === WebSocket.OPEN) send(socket, reply);
}

/**
 * Anexa endpoints WebSocket mockados a um servidor HTTP já existente (útil para
 * compartilhar a mesma porta do mock REST). Cada endpoint casa por `path` exato.
 */
export function attachWsMock(httpServer: Server, config: WsMockConfig): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });
  const byPath = new Map(config.map((endpoint) => [endpoint.path, endpoint]));

  httpServer.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url ?? "/", "http://mock");
    const endpoint = byPath.get(url.pathname);
    if (!endpoint) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
      bindEndpoint(ws, endpoint);
    });
  });

  return wss;
}

function bindEndpoint(socket: WebSocket, endpoint: WsEndpointConfig): void {
  for (const greeting of endpoint.onOpen ?? []) send(socket, greeting);
  socket.on("message", (data) => {
    const text = messageText(data);
    const rule = findMatchingRule(endpoint.scripted, text);
    if (rule) void replyTo(socket, rule);
  });
}

/** Carrega a configuração de endpoints WebSocket a partir de um arquivo JSON. */
export async function loadWsMockConfig(path: string): Promise<WsMockConfig> {
  const text = await readFile(path, "utf8");
  return JSON.parse(text) as WsMockConfig;
}
