import { parseArgs } from "../../core/src/args.js";
import { listAll, listInstances, type ProviderName } from "./providers.js";
const args = parseArgs(process.argv.slice(2));
const [command, resource] = args._ as string[];
if (command !== "list" || resource !== "instances") {
  console.log("Uso: swisscloud list instances [--provider aws|azure|gcp|all]");
  process.exit(1);
}
const provider = typeof args.provider === "string" ? args.provider : "all";
if (!["aws", "azure", "gcp", "all"].includes(provider)) throw new Error("Provider inválido");
console.log(JSON.stringify(provider === "all" ? await listAll() : await listInstances(provider as ProviderName), null, 2));
