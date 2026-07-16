import { readFile } from "node:fs/promises";
import { parseArgs, numberArg, stringArg } from "../../core/src/args.js";
import { startAgent } from "./agent.js";
import { measure, type AgentInfo } from "./protocol.js";
import { runSystemTraceroute, udpTtlProbe, discoverPathMtu } from "./traceroute.js";
import { runJitterTest, startJitterEchoServer } from "./jitterTest.js";
import { appendHistory, loadHistory, compareResults, compareLastAgainstAverage, averageHistory, DEFAULT_HISTORY_PATH, type HistoryEntry } from "./comparisonReport.js";
import { startBurstScheduler, computeNextRuns } from "./burstScheduler.js";

const args = parseArgs(process.argv.slice(2));
const [command, file] = args._ as string[];

if (command === "agent") {
  startAgent(numberArg(args, "port", 4090));
} else if (command === "run" && file) {
  const agents = JSON.parse(await readFile(file, "utf8")) as AgentInfo[];
  const results = await Promise.allSettled(agents.map((agent) => measure(agent, numberArg(args, "bytes", 2_000_000))));
  const values = results.map((result, index) => result.status === "fulfilled"
    ? result.value : { agentId: agents[index]?.id, error: result.reason instanceof Error ? result.reason.message : String(result.reason) });
  console.log(JSON.stringify(values, null, 2));
} else if (command === "traceroute") {
  const target = stringArg(args, "target");
  const mode = stringArg(args, "mode", "system");
  const result = mode === "udp"
    ? await udpTtlProbe(target, numberArg(args, "port", 33434), numberArg(args, "max-hops", 30))
    : await runSystemTraceroute(target, numberArg(args, "max-hops", 30));
  console.log(JSON.stringify(result, null, 2));
} else if (command === "mtu") {
  const target = stringArg(args, "target");
  const result = await discoverPathMtu(target, numberArg(args, "port", 33434));
  console.log(JSON.stringify(result, null, 2));
} else if (command === "jitter-listen") {
  const port = numberArg(args, "port", 4091);
  startJitterEchoServer(port);
  console.log(`Listener de eco UDP (jitter) na porta ${port}`);
} else if (command === "jitter") {
  const result = await runJitterTest({
    host: stringArg(args, "host", "127.0.0.1"),
    port: numberArg(args, "port", 4091),
    count: numberArg(args, "count", 20),
    intervalMs: numberArg(args, "interval", 50),
    timeoutMs: numberArg(args, "timeout", 1000)
  });
  console.log(JSON.stringify(result, null, 2));
  if (args.save) {
    const entry: HistoryEntry = {
      id: typeof args.id === "string" ? args.id : new Date().toISOString(),
      measuredAt: result.measuredAt, latencyMs: result.avgLatencyMs, jitterMs: result.jitterMs,
      lossPercent: result.lossPercent, downloadMbps: 0, uploadMbps: 0
    };
    await appendHistory(entry, stringArg(args, "history", DEFAULT_HISTORY_PATH));
    console.log(`Resultado salvo no histórico: ${stringArg(args, "history", DEFAULT_HISTORY_PATH)}`);
  }
} else if (command === "history") {
  const history = await loadHistory(stringArg(args, "history", DEFAULT_HISTORY_PATH));
  console.log(JSON.stringify(history, null, 2));
} else if (command === "compare") {
  const history = await loadHistory(stringArg(args, "history", DEFAULT_HISTORY_PATH));
  if (typeof args.a === "string" && typeof args.b === "string") {
    const entryA = history.find((entry) => entry.id === args.a);
    const entryB = history.find((entry) => entry.id === args.b);
    if (!entryA || !entryB) { console.error("Execuções informadas não encontradas no histórico"); process.exit(1); }
    console.log(JSON.stringify(compareResults(averageHistory([entryA!]), averageHistory([entryB!]), { baselineLabel: entryA!.id, currentLabel: entryB!.id }), null, 2));
  } else {
    const report = compareLastAgainstAverage(history, args.threshold ? numberArg(args, "threshold", 10) : undefined);
    if (!report) { console.log("Histórico insuficiente para comparação (mínimo 2 execuções)"); process.exit(0); }
    console.log(JSON.stringify(report, null, 2));
  }
} else if (command === "burst") {
  const cronExpression = stringArg(args, "cron", "*/30 * * * *");
  const host = stringArg(args, "host", "127.0.0.1");
  const port = numberArg(args, "port", 4091);
  const maxRuns = args["max-runs"] ? numberArg(args, "max-runs", 0) : undefined;
  console.log(`Agendamento burst iniciado (cron="${cronExpression}"). Próximas execuções: ${computeNextRuns(cronExpression, 3).map((d) => d.toISOString()).join(", ")}`);
  const handle = startBurstScheduler({
    cronExpression, maxRuns,
    task: async () => {
      const result = await runJitterTest({ host, port });
      console.log(`[burst ${new Date().toISOString()}] ${JSON.stringify(result)}`);
      await appendHistory({
        id: new Date().toISOString(), measuredAt: result.measuredAt, latencyMs: result.avgLatencyMs,
        jitterMs: result.jitterMs, lossPercent: result.lossPercent, downloadMbps: 0, uploadMbps: 0
      }, stringArg(args, "history", DEFAULT_HISTORY_PATH));
    },
    onError: (error) => console.error("Erro na execução agendada:", error)
  });
  process.on("SIGINT", () => { handle.stop(); process.exit(0); });
} else {
  console.log([
    "Uso: network-test <comando> [opções]",
    "  agent [--port 4090]",
    "  run <agents.json> [--bytes 2000000]",
    "  traceroute --target <host> [--mode system|udp] [--max-hops 30] [--port 33434]",
    "  mtu --target <host> [--port 33434]",
    "  jitter-listen [--port 4091]",
    "  jitter [--host 127.0.0.1] [--port 4091] [--count 20] [--interval 50] [--save] [--id nome]",
    "  history [--history <arquivo>]",
    "  compare [--a <id> --b <id>] [--threshold 10] [--history <arquivo>]",
    "  burst --cron \"*/30 * * * *\" [--host 127.0.0.1] [--port 4091] [--max-runs N]"
  ].join("\n"));
  process.exit(1);
}
