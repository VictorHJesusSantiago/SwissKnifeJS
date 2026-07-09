import { parseArgs, stringArg } from "../../core/src/args.js";
import { loadSpec } from "../../openapi-docgen/src/spec.js";
import { testContract } from "./validator.js";
const args = parseArgs(process.argv.slice(2));
const input = (args._ as string[])[0];
if (!input) throw new Error("Uso: contract-test <spec.yaml|json> --base-url http://localhost:3000");
const report = await testContract(await loadSpec(input), stringArg(args, "base-url"));
console.log(JSON.stringify(report, null, 2));
if (report.failed) process.exitCode = 1;
