import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { parseArgs, stringArg } from "../../core/src/args.js";
import { checkTarget, buildAlertEvents, sendAlerts, type AlertConfig, type Target } from "./monitor.js";
import { appendHistory, readHistory } from "./history.js";
import { exportHistory, type ExportFormat } from "./export.js";
import { generateDashboard } from "./dashboard.js";
import { lookupRecords, compareResolvers, type RecordType } from "./dns.js";
import { checkTargetAcrossRegions, type Region } from "./regions.js";

interface Config {
  intervalSeconds?: number;
  webhook?: string;
  alert?: AlertConfig;
  sslWarningDays?: number;
  historyFile?: string;
  targets: Target[];
  regions?: Region[];
}

const USAGE = `Uso:
  uptime-ssl <config.json> [--once]
  uptime-ssl export --history <arquivo> --format csv|json [--out <arquivo>]
  uptime-ssl dashboard --history <arquivo> [--out <arquivo>]
  uptime-ssl dns --host <hostname> [--types A,AAAA,CNAME,MX,TXT,NS,SOA] [--resolver <ip>] [--resolvers <ip1,ip2>]
  uptime-ssl regions <config.json>`;

const args = parseArgs(process.argv.slice(2));
const positionals = args._ as string[];
const command = positionals[0];

async function writeOutput(out: string | undefined, content: string): Promise<void> {
  if (!out) {
    process.stdout.write(content);
    return;
  }
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, content, "utf8");
}

async function loadConfig(path: string | undefined): Promise<Config> {
  if (!path) throw new Error("Informe o caminho do arquivo de configuração");
  const config = JSON.parse(await readFile(path, "utf8")) as Config;
  if (!Array.isArray(config.targets) || !config.targets.length) throw new Error("Configure ao menos um target");
  return config;
}

function resolveAlert(config: Config): AlertConfig | undefined {
  if (config.alert) return config.alert;
  if (config.webhook) return { url: config.webhook };
  return undefined;
}

async function runMonitor(config: Config): Promise<void> {
  const results = await Promise.all(config.targets.map(checkTarget));
  for (const result of results) console.log(JSON.stringify(result));
  if (config.historyFile) await appendHistory(config.historyFile, results);
  const alert = resolveAlert(config);
  if (alert) {
    const events = buildAlertEvents(results, config.sslWarningDays ?? 14);
    if (events.length) await sendAlerts(alert, events);
  }
}

async function runExport(): Promise<void> {
  const history = await readHistory(stringArg(args, "history"));
  const format = stringArg(args, "format", "json") as ExportFormat;
  if (format !== "csv" && format !== "json") throw new Error("--format deve ser csv ou json");
  await writeOutput(typeof args.out === "string" ? args.out : undefined, exportHistory(history, format));
}

async function runDashboard(): Promise<void> {
  const history = await readHistory(stringArg(args, "history"));
  const html = generateDashboard(history);
  const out = typeof args.out === "string" ? args.out : "uptime-dashboard.html";
  await writeOutput(out, html);
  console.error(`Dashboard gerado em ${out}`);
}

async function runDns(): Promise<void> {
  const host = stringArg(args, "host");
  const types = (typeof args.types === "string" ? args.types.split(",") : ["A", "AAAA", "CNAME", "MX", "TXT"]) as RecordType[];
  if (typeof args.resolvers === "string") {
    const resolvers = args.resolvers.split(",");
    const comparisons = await compareResolvers(host, types, resolvers);
    console.log(JSON.stringify(comparisons, null, 2));
    return;
  }
  const resolverIp = typeof args.resolver === "string" ? args.resolver : undefined;
  const results = await lookupRecords(host, types, resolverIp);
  console.log(JSON.stringify(results, null, 2));
}

async function runRegions(): Promise<void> {
  const config = await loadConfig(positionals[1]);
  if (!config.regions?.length) throw new Error("Configure ao menos uma região em 'regions'");
  const report = await Promise.all(config.targets.map(async (target) => ({
    target: target.name,
    results: await checkTargetAcrossRegions(target, config.regions!)
  })));
  console.log(JSON.stringify(report, null, 2));
}

if (args.help || !command) {
  console.log(USAGE);
  process.exit(command ? 0 : 1);
}

switch (command) {
  case "export":
    await runExport();
    break;
  case "dashboard":
    await runDashboard();
    break;
  case "dns":
    await runDns();
    break;
  case "regions":
    await runRegions();
    break;
  default: {
    const config = await loadConfig(command);
    await runMonitor(config);
    if (!args.once) {
      const interval = Math.max(10, config.intervalSeconds ?? 60) * 1000;
      setInterval(() => void runMonitor(config).catch(console.error), interval);
    }
  }
}
