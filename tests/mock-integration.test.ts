import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";
import { createRecordingMockServer } from "../packages/openapi-mock/src/recorder.js";
import { generateContractFromRecording, readRecordedInteractions } from "../packages/contract-tester/src/mockIntegration.js";
import { verifyContract } from "../packages/contract-tester/src/contractGenerator.js";
import { createMockServer } from "../packages/openapi-mock/src/server.js";
import type { OpenApi } from "../packages/openapi-docgen/src/spec.js";

let servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  servers = [];
});

const spec: OpenApi = {
  openapi: "3.0.3",
  info: { title: "Integration", version: "1" },
  paths: {
    "/users/{id}": {
      get: {
        operationId: "get-user",
        responses: {
          "200": {
            description: "ok",
            content: {
              "application/json": {
                schema: { type: "object", required: ["id"], properties: { id: { type: "integer" } } }
              }
            }
          }
        }
      }
    }
  }
};

async function listen(server: Server): Promise<string> {
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Endereço inválido");
  return `http://127.0.0.1:${address.port}`;
}

describe("mockIntegration", () => {
  it("grava interações do mock em NDJSON e converte em contrato", async () => {
    const dir = await mkdtemp(join(tmpdir(), "recording-"));
    const recordingPath = join(dir, "recording.ndjson");

    const recordingServer = createRecordingMockServer(spec, recordingPath);
    const baseUrl = await listen(recordingServer);
    const response = await fetch(new URL("/users/1", baseUrl));
    await response.json();

    const records = await readRecordedInteractions(recordingPath);
    expect(records).toHaveLength(1);
    expect(records[0]!.method).toBe("GET");
    expect(records[0]!.responseStatus).toBe(200);

    const contract = await generateContractFromRecording(recordingPath, "consumer-x", "provider-x");
    expect(contract.consumer).toBe("consumer-x");
    expect(contract.interactions).toHaveLength(1);
    expect(contract.interactions[0]!.request.path).toBe("/users/1");

    // O contrato gerado a partir da gravação deve ser verificável contra um provider real (aqui, o próprio mock).
    const providerServer = createMockServer(spec);
    const providerUrl = await listen(providerServer);
    const report = await verifyContract(contract, providerUrl);
    expect(report).toEqual({ passed: 1, failed: 0, failures: [], passedOperations: ["GET /users/1"] });

    await rm(dir, { recursive: true, force: true });
  });
});
