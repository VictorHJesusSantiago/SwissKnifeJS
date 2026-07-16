import { parseArgs } from "../../core/src/args.js";
import { listAll, listInstances, type ProviderName, type Resource } from "./providers.js";
import { diffConfigFiles } from "./diffConfig.js";
import { translateCommand, type ProviderName as TranslatorProvider } from "./commandTranslator.js";
import { clearCache, defaultCachePath, withCache } from "./cache.js";
import { runWithDryRun } from "./dryRun.js";

const USAGE = [
  "Uso:",
  "  swisscloud list instances [--provider aws|azure|gcp|all] [--cache] [--ttl <ms>] [--dry-run]",
  "  swisscloud diff <config-a.json> <config-b.json>",
  "  swisscloud translate --command \"aws s3 ls\" [--to azure,gcp]",
  "  swisscloud cache clear",
].join("\n");

function usageError(): never {
  console.log(USAGE);
  process.exit(1);
}

async function main(): Promise<void> {
const args = parseArgs(process.argv.slice(2));
const [command, resource, ...rest] = args._ as string[];

if (command === "list" && resource === "instances") {
  const provider = typeof args.provider === "string" ? args.provider : "all";
  if (!["aws", "azure", "gcp", "all"].includes(provider)) throw new Error("Provider inválido");

  const fetchInstances = async (): Promise<Resource[] | { resources: Resource[]; errors: Record<string, string> }> =>
    provider === "all" ? listAll() : listInstances(provider as ProviderName);

  const result = await runWithDryRun(
    args,
    { action: "list-instances", details: { provider } },
    async () => {
      if (args.cache) {
        const ttlMs = typeof args.ttl === "string" ? Number(args.ttl) : undefined;
        const { value, fromCache } = await withCache(
          `list-instances:${provider}`,
          { path: defaultCachePath(), ttlMs },
          fetchInstances
        );
        return { data: value, fromCache };
      }
      return fetchInstances();
    }
  );
  console.log(JSON.stringify(result, null, 2));
} else if (command === "diff") {
  const [configA, configB] = [resource, ...rest];
  if (!configA || !configB) {
    console.log("Uso: swisscloud diff <config-a.json> <config-b.json>");
    process.exit(1);
  }
  const result = await runWithDryRun(
    args,
    { action: "diff-config", details: { configA, configB } },
    () => diffConfigFiles(configA, configB)
  );
  console.log(JSON.stringify(result, null, 2));
} else if (command === "translate") {
  const commandToTranslate = typeof args.command === "string" ? args.command : undefined;
  if (!commandToTranslate) {
    console.log('Uso: swisscloud translate --command "aws s3 ls" [--to azure,gcp]');
    process.exit(1);
  }
  const targets =
    typeof args.to === "string"
      ? (args.to.split(",").map((p) => p.trim()) as TranslatorProvider[])
      : undefined;
  const result = await runWithDryRun(
    args,
    { action: "translate-command", details: { command: commandToTranslate, targets } },
    async () => translateCommand(commandToTranslate, targets)
  );
  console.log(JSON.stringify(result, null, 2));
} else if (command === "cache" && resource === "clear") {
  await clearCache(defaultCachePath());
  console.log(JSON.stringify({ cleared: true, path: defaultCachePath() }, null, 2));
} else {
  usageError();
}
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
