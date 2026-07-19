import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";
import {
  createContract,
  loadContract,
  recordInteraction,
  shapeMatches,
  verifyContract,
  writeContract
} from "../packages/contract-tester/src/contractGenerator.js";
import { createMockServer } from "../packages/openapi-mock/src/server.js";
import type { OpenApi } from "../packages/openapi-docgen/src/spec.js";

let server: Server | undefined;
afterEach(async () => server?.close());

describe("contractGenerator", () => {
  it("compara formato (shape) ignorando valores concretos", () => {
    expect(shapeMatches({ id: 1, name: "a" }, { id: 2, name: "b" })).toEqual([]);
    expect(shapeMatches({ id: 1 }, { name: "b" })).toEqual(["$.id ausente na resposta"]);
    expect(shapeMatches({ id: 1 }, { id: "x" })).toEqual(["$.id deveria ser do tipo number, recebeu string"]);
  });

  it("grava e carrega um contrato em disco", async () => {
    const dir = await mkdtemp(join(tmpdir(), "contract-"));
    const contract = createContract("consumer-a", "provider-a", [
      recordInteraction("busca usuário", { method: "GET", path: "/users/1" }, { status: 200, body: { id: 1 } })
    ]);
    const path = join(dir, "contract.json");
    await writeContract(path, contract);
    const loaded = await loadContract(path);
    expect(loaded.consumer).toBe("consumer-a");
    expect(loaded.interactions).toHaveLength(1);
    await rm(dir, { recursive: true, force: true });
  });

  it("verifica um contrato contra um provider real (mock)", async () => {
    const spec: OpenApi = {
      openapi: "3.0.3",
      info: { title: "Contract", version: "1" },
      paths: {
        "/users/{id}": {
          get: {
            operationId: "get-users",
            responses: {
              "200": {
                description: "ok",
                content: { "application/json": { schema: { type: "object", properties: { id: { type: "integer" } } } } }
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
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const contract = createContract("consumer-a", "provider-a", [
      recordInteraction(
        "busca usuário por id",
        { method: "GET", path: "/users/1" },
        { status: 200, body: { id: 0 } },
        "get-users"
      )
    ]);
    const report = await verifyContract(contract, baseUrl);
    expect(report).toEqual({ passed: 1, failed: 0, failures: [], passedOperations: ["GET /users/1"] });
  });

  it("reporta falha quando o provider quebra o contrato", async () => {
    const spec: OpenApi = {
      openapi: "3.0.3",
      info: { title: "Contract", version: "1" },
      paths: {
        "/orders": {
          get: {
            responses: {
              "200": { description: "ok", content: { "application/json": { schema: { type: "object" } } } }
            }
          }
        }
      }
    };
    server = createMockServer(spec);
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Endereço inválido");
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const contract = createContract("consumer-a", "provider-a", [
      recordInteraction("pedido inexistente", { method: "GET", path: "/orders" }, { status: 201, body: {} })
    ]);
    const report = await verifyContract(contract, baseUrl);
    expect(report.failed).toBe(1);
    expect(report.failures[0]!.message).toContain("status esperado 201");
  });
});
