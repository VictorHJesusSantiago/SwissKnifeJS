import { readFile } from "node:fs/promises";
import { parseArgs } from "../../core/src/args.js";
import { checkTarget, notify, type Target } from "./monitor.js";

interface Config { intervalSeconds?: number; webhook?: string; targets: Target[] }
const args = parseArgs(process.argv.slice(2));
const configPath = (args._ as string[])[0];
if (!configPath || args.help) {
  console.log("Uso: npm run uptime -- <config.json> [--once]");
  process.exit(configPath ? 0 : 1);
}
const config = JSON.parse(await readFile(configPath, "utf8")) as Config;
if (!Array.isArray(config.targets) || !config.targets.length) throw new Error("Configure ao menos um target");

async function run(): Promise<void> {
  const results = await Promise.all(config.targets.map(checkTarget));
  for (const result of results) console.log(JSON.stringify(result));
  if (config.webhook) await notify(config.webhook, results);
}

await run();
if (!args.once) {
  const interval = Math.max(10, config.intervalSeconds ?? 60) * 1000;
  setInterval(() => void run().catch(console.error), interval);
}
