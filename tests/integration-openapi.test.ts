import { afterEach, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { createMockServer } from "../packages/openapi-mock/src/server.js";
import { testContract } from "../packages/contract-tester/src/validator.js";
import type { OpenApi } from "../packages/openapi-docgen/src/spec.js";
let server: Server | undefined;
afterEach(() => server?.close());
describe("mock + contrato", () => {
  it("atende e valida uma especificação completa", async () => {
    const spec: OpenApi = {
      openapi: "3.0.3",
      info: { title: "Integration", version: "1" },
      paths: {
        "/users/{id}": {
          get: {
            responses: {
              "200": {
                description: "ok",
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      required: ["id"],
                      properties: { id: { type: "integer" } }
                    }
                  }
                }
              }
            }
          }
        }
      }
    };
    server = createMockServer(spec);
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Endereço inválido");
    const report = await testContract(spec, `http://127.0.0.1:${address.port}`);
    expect(report).toEqual({ passed: 1, failed: 0, failures: [], passedOperations: ["GET /users/{id}"] });
  });
});
