import { afterEach, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { json } from "../packages/core/src/http.js";
import {
  createProxyRecorderServer,
  generateScenarioFile,
  loadProxyRecordings,
  loadScenarioFile,
  scenariosFromRecordings
} from "../packages/openapi-mock/src/recorder.js";
import { createMockServer } from "../packages/openapi-mock/src/server.js";
import type { OpenApi } from "../packages/openapi-docgen/src/spec.js";

let backend: Server | undefined;
let proxy: Server | undefined;
let mockServer: Server | undefined;
let tempDir: string | undefined;
let extraFile: string | undefined;

afterEach(async () => {
  backend?.close();
  proxy?.close();
  mockServer?.close();
  if (tempDir) await rm(tempDir, { recursive: true, force: true });
  if (extraFile) await rm(extraFile, { force: true });
});

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Endereço inválido");
  return address.port;
}

describe("recorder (proxy reverso)", () => {
  it("grava requisição/resposta reais em disco e devolve a resposta ao cliente", async () => {
    backend = createServer((request, response) => json(response, 201, { id: 1, path: request.url }));
    const backendPort = await listen(backend);

    tempDir = await mkdtemp(join(tmpdir(), "openapi-mock-record-"));
    proxy = createProxyRecorderServer({ target: `http://127.0.0.1:${backendPort}`, outDir: tempDir });
    const proxyPort = await listen(proxy);

    const response = await fetch(`http://127.0.0.1:${proxyPort}/orders/1`);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: 1, path: "/orders/1" });

    const recordings = await loadProxyRecordings(tempDir);
    expect(recordings).toHaveLength(1);
    expect(recordings[0]).toMatchObject({ method: "GET", path: "/orders/1", status: 201 });
  });

  it("gera cenários de mock a partir das gravações e reproduz no mock server", async () => {
    backend = createServer((request, response) => json(response, 200, { greeting: `olá ${request.url}` }));
    const backendPort = await listen(backend);

    tempDir = await mkdtemp(join(tmpdir(), "openapi-mock-record-"));
    proxy = createProxyRecorderServer({ target: `http://127.0.0.1:${backendPort}`, outDir: tempDir });
    const proxyPort = await listen(proxy);
    await fetch(`http://127.0.0.1:${proxyPort}/hello`);
    proxy.close();

    const scenarioFile = join(tempDir, "..", `scenarios-${Date.now()}.json`);
    extraFile = scenarioFile;
    const scenarios = await generateScenarioFile(tempDir, scenarioFile);
    expect(scenarios).toEqual(scenariosFromRecordings(await loadProxyRecordings(tempDir)));

    const loaded = await loadScenarioFile(scenarioFile);
    const spec: OpenApi = { openapi: "3.0.3", info: { title: "Replay", version: "1" }, paths: {} };
    mockServer = createMockServer(spec, { scenarios: loaded });
    const mockPort = await listen(mockServer);
    const replayed = await fetch(`http://127.0.0.1:${mockPort}/hello`);
    expect(await replayed.json()).toEqual({ greeting: "olá /hello" });
  });
});
