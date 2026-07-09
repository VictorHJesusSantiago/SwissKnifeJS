import { writeFile } from "node:fs/promises";
import { parseArgs, stringArg } from "../../core/src/args.js";
import { generateMarkdown } from "./generator.js";
import { loadSpec } from "./spec.js";
const args = parseArgs(process.argv.slice(2));
const input = (args._ as string[])[0];
if (!input || args.help) {
  console.log("Uso: openapi-docgen <spec.yaml|json> [--out API.md]");
  process.exit(input ? 0 : 1);
}
const output = stringArg(args, "out", "API.md");
const spec = await loadSpec(input);
await writeFile(output, generateMarkdown(spec), "utf8");
console.log(`Documentação gerada em ${output}`);
