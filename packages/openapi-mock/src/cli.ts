import { parseArgs, numberArg, stringArg } from "../../core/src/args.js";
import { loadSpec } from "../../openapi-docgen/src/spec.js";
import { createMockServer, type MockServerOptions } from "./server.js";
import { loadChaosConfig } from "./chaos.js";
import { createProxyRecorderServer, generateScenarioFile, loadScenarioFile } from "./recorder.js";
import { attachWsMock, loadWsMockConfig } from "./wsMock.js";

const args = parseArgs(process.argv.slice(2));

// Modo "record": atua como proxy reverso para um backend real, gravando cada
// requisição/resposta em disco. Ex: openapi-mock --record --target http://localhost:3000 --out ./recordings
if (args.record) {
  const target = stringArg(args, "target");
  const outDir = stringArg(args, "out", "./recordings");
  const port = numberArg(args, "port", 4010);
  const server = createProxyRecorderServer({ target, outDir });
  server.listen(port, () => console.log(`Proxy de gravação em http://localhost:${port} -> ${target} (gravando em ${outDir})`));
  process.exit(0);
}

// Modo "generate-scenarios": converte gravações do modo record em cenários de mock.
if (args["generate-scenarios"]) {
  const recordingsDir = stringArg(args, "recordings", "./recordings");
  const outFile = stringArg(args, "out", "./scenarios.json");
  const scenarios = await generateScenarioFile(recordingsDir, outFile);
  console.log(`Gerados ${scenarios.length} cenário(s) de mock em ${outFile}`);
  process.exit(0);
}

const input = (args._ as string[])[0];
if (!input) throw new Error("Uso: openapi-mock <spec.yaml|json> [--port 4010] [--chaos chaos.json] [--faker] [--scenarios scenarios.json] [--ws ws.json]");
const port = numberArg(args, "port", 4010);

const options: MockServerOptions = {};
if (typeof args.chaos === "string") options.chaos = await loadChaosConfig(args.chaos);
if (args.faker) options.faker = true;
if (typeof args.scenarios === "string") options.scenarios = await loadScenarioFile(args.scenarios);

const server = createMockServer(await loadSpec(input), options);

if (typeof args.ws === "string") {
  const wsConfig = await loadWsMockConfig(args.ws);
  attachWsMock(server, wsConfig);
  console.log(`Endpoints WebSocket mockados: ${wsConfig.map((endpoint) => endpoint.path).join(", ")}`);
}

server.listen(port, () => console.log(`Mock OpenAPI em http://localhost:${port}`));
