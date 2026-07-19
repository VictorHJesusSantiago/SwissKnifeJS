import { afterEach, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { createMockServer } from "../packages/openapi-mock/src/server.js";
import type { OpenApi } from "../packages/openapi-docgen/src/spec.js";
import { evaluateChaos, findChaosRule } from "../packages/openapi-mock/src/chaos.js";

const spec: OpenApi = {
  openapi: "3.0.3",
  info: { title: "Chaos", version: "1" },
  paths: {
    "/items": {
      get: {
        responses: {
          "200": { description: "ok", content: { "application/json": { schema: { type: "object", properties: { id: { type: "integer" } } } } } }
        }
      }
    }
  }
};

let server: Server | undefined;
afterEach(() => server?.close());

describe("chaos", () => {
  it("localiza regra específica antes do curinga", () => {
    const config = { "GET /items": { delay: { ms: 5 } }, "*": { error: { rate: 1 } } };
    expect(findChaosRule(config, "get", "/items")).toEqual({ delay: { ms: 5 } });
  });

  it("aplica atraso fixo configurado", () => {
    const outcome = evaluateChaos({ delay: { ms: 42 } });
    expect(outcome.delayMs).toBe(42);
  });

  it("força erro quando a taxa é 100%", () => {
    const outcome = evaluateChaos({ error: { rate: 1, status: 503, body: { error: "fora do ar" } } });
    expect(outcome.forcedStatus).toBe(503);
    expect(outcome.forcedBody).toEqual({ error: "fora do ar" });
  });

  it("nunca força erro quando a taxa é 0%", () => {
    const outcome = evaluateChaos({ error: { rate: 0, status: 500 } });
    expect(outcome.forcedStatus).toBeUndefined();
  });

  it("servidor mock retorna status forçado configurado via chaos", async () => {
    server = createMockServer(spec, { chaos: { "GET /items": { error: { rate: 1, status: 503 } } } });
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Endereço inválido");
    const response = await fetch(`http://127.0.0.1:${address.port}/items`);
    expect(response.status).toBe(503);
    expect(response.headers.get("x-mock-chaos")).toBe("GET /items");
  });

  it("servidor mock aplica atraso configurado via chaos", async () => {
    server = createMockServer(spec, { chaos: { "GET /items": { delay: { ms: 60 } } } });
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Endereço inválido");
    const start = Date.now();
    const response = await fetch(`http://127.0.0.1:${address.port}/items`);
    expect(response.status).toBe(200);
    expect(Date.now() - start).toBeGreaterThanOrEqual(55);
  });
});
