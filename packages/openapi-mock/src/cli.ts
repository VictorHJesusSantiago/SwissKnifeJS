import { parseArgs, numberArg } from "../../core/src/args.js";
import { loadSpec } from "../../openapi-docgen/src/spec.js";
import { createMockServer } from "./server.js";
const args = parseArgs(process.argv.slice(2));
const input = (args._ as string[])[0];
if (!input) throw new Error("Uso: openapi-mock <spec.yaml|json> [--port 4010]");
const port = numberArg(args, "port", 4010);
const server = createMockServer(await loadSpec(input));
server.listen(port, () => console.log(`Mock OpenAPI em http://localhost:${port}`));
