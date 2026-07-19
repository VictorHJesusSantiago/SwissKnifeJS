import { afterEach, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { WebSocket } from "ws";
import { attachWsMock, type WsMockConfig } from "../packages/openapi-mock/src/wsMock.js";

let server: Server | undefined;
afterEach(() => server?.close());

async function listen(target: Server): Promise<number> {
  await new Promise<void>((resolve) => target.listen(0, "127.0.0.1", resolve));
  const address = target.address();
  if (!address || typeof address === "string") throw new Error("Endereço inválido");
  return address.port;
}

describe("wsMock", () => {
  it("envia mensagens de onOpen assim que o cliente conecta", async () => {
    server = createServer();
    const config: WsMockConfig = [{ path: "/ws/greet", onOpen: [{ type: "welcome" }] }];
    attachWsMock(server, config);
    const port = await listen(server);

    const client = new WebSocket(`ws://127.0.0.1:${port}/ws/greet`);
    const message = await new Promise<string>((resolve) => client.once("message", (data) => resolve(data.toString())));
    expect(JSON.parse(message)).toEqual({ type: "welcome" });
    client.close();
  });

  it("responde com script quando a mensagem casa por texto exato", async () => {
    server = createServer();
    const config: WsMockConfig = [
      { path: "/ws/echo", scripted: [{ when: "ping", reply: { type: "pong" } }] }
    ];
    attachWsMock(server, config);
    const port = await listen(server);

    const client = new WebSocket(`ws://127.0.0.1:${port}/ws/echo`);
    await new Promise<void>((resolve) => client.once("open", () => resolve()));
    client.send("ping");
    const message = await new Promise<string>((resolve) => client.once("message", (data) => resolve(data.toString())));
    expect(JSON.parse(message)).toEqual({ type: "pong" });
    client.close();
  });

  it("responde com script quando a mensagem casa por regex", async () => {
    server = createServer();
    const config: WsMockConfig = [
      { path: "/ws/regex", scripted: [{ match: "^order:\\d+$", reply: [{ status: "ack" }, { status: "done" }] }] }
    ];
    attachWsMock(server, config);
    const port = await listen(server);

    const client = new WebSocket(`ws://127.0.0.1:${port}/ws/regex`);
    await new Promise<void>((resolve) => client.once("open", () => resolve()));
    const received: string[] = [];
    client.on("message", (data) => received.push(data.toString()));
    client.send("order:42");
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(received.map((entry) => JSON.parse(entry))).toEqual([{ status: "ack" }, { status: "done" }]);
    client.close();
  });

  it("destroi a conexão para caminhos não configurados", async () => {
    server = createServer();
    attachWsMock(server, [{ path: "/ws/known" }]);
    const port = await listen(server);

    const client = new WebSocket(`ws://127.0.0.1:${port}/ws/unknown`);
    const closed = await new Promise<boolean>((resolve) => {
      client.once("error", () => resolve(true));
      client.once("close", () => resolve(true));
    });
    expect(closed).toBe(true);
  });
});
