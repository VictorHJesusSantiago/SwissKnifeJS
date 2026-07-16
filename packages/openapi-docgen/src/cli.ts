import { writeFile } from "node:fs/promises";
import { parseArgs, stringArg } from "../../core/src/args.js";
import { generateMarkdown } from "./generator.js";
import { loadSpec } from "./spec.js";
import { generateChangelog } from "./changelog.js";
import { findBreakingChanges, suggestBump } from "./breakingChanges.js";
import { exportPostmanCollection } from "./exportPostman.js";
import { exportInsomniaCollection } from "./exportInsomnia.js";
import { generateTypeScriptSdk } from "./sdkGenerator.js";

const HELP = `Uso:
  openapi-docgen <spec.yaml|json> [--out API.md]
  openapi-docgen changelog <before.yaml|json> <after.yaml|json> [--out CHANGELOG.md]
  openapi-docgen breaking-changes <before.yaml|json> <after.yaml|json>
  openapi-docgen export-postman <spec.yaml|json> [--out collection.json]
  openapi-docgen export-insomnia <spec.yaml|json> [--out insomnia.json]
  openapi-docgen generate-sdk <spec.yaml|json> [--out sdk.ts]`;

const args = parseArgs(process.argv.slice(2));
const positional = args._ as string[];
const subcommands = new Set(["changelog", "breaking-changes", "export-postman", "export-insomnia", "generate-sdk"]);
const command = positional[0] && subcommands.has(positional[0]) ? positional[0] : undefined;

if (args.help || (!command && !positional[0])) {
  console.log(HELP);
  process.exit(positional[0] ? 0 : 1);
}

if (command === "changelog") {
  const [, beforePath, afterPath] = positional;
  if (!beforePath || !afterPath) { console.log(HELP); process.exit(1); }
  const output = stringArg(args, "out", "CHANGELOG.md");
  const before = await loadSpec(beforePath);
  const after = await loadSpec(afterPath);
  await writeFile(output, generateChangelog(before, after), "utf8");
  console.log(`Changelog gerado em ${output}`);
} else if (command === "breaking-changes") {
  const [, beforePath, afterPath] = positional;
  if (!beforePath || !afterPath) { console.log(HELP); process.exit(1); }
  const before = await loadSpec(beforePath);
  const after = await loadSpec(afterPath);
  const changes = findBreakingChanges(before, after);
  const bump = suggestBump(before, after);
  if (changes.length) {
    console.log(`Breaking changes detectados (${changes.length}):`);
    for (const change of changes) console.log(`- ${change.message}`);
  } else {
    console.log("Nenhum breaking change detectado.");
  }
  console.log(`Sugestão de versionamento semver: ${bump}`);
  process.exit(changes.length ? 1 : 0);
} else if (command === "export-postman") {
  const input = positional[1];
  if (!input) { console.log(HELP); process.exit(1); }
  const output = stringArg(args, "out", "collection.json");
  const spec = await loadSpec(input);
  await writeFile(output, JSON.stringify(exportPostmanCollection(spec), null, 2), "utf8");
  console.log(`Coleção Postman gerada em ${output}`);
} else if (command === "export-insomnia") {
  const input = positional[1];
  if (!input) { console.log(HELP); process.exit(1); }
  const output = stringArg(args, "out", "insomnia.json");
  const spec = await loadSpec(input);
  await writeFile(output, JSON.stringify(exportInsomniaCollection(spec), null, 2), "utf8");
  console.log(`Coleção Insomnia gerada em ${output}`);
} else if (command === "generate-sdk") {
  const input = positional[1];
  if (!input) { console.log(HELP); process.exit(1); }
  const output = stringArg(args, "out", "sdk.ts");
  const spec = await loadSpec(input);
  await writeFile(output, generateTypeScriptSdk(spec), "utf8");
  console.log(`SDK TypeScript gerado em ${output}`);
} else {
  const input = positional[0]!;
  const output = stringArg(args, "out", "API.md");
  const spec = await loadSpec(input);
  await writeFile(output, generateMarkdown(spec), "utf8");
  console.log(`Documentação gerada em ${output}`);
}
