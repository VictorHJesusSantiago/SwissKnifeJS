import { readFile } from "node:fs/promises";
import { parseArgs, numberArg } from "../../core/src/args.js";
import { startAgent } from "./agent.js";
import { measure, type AgentInfo } from "./protocol.js";

const args = parseArgs(process.argv.slice(2));
const [command, file] = args._ as string[];
if (command === "agent") startAgent(numberArg(args, "port", 4090));
else if (command === "run" && file) {
  const agents = JSON.parse(await readFile(file, "utf8")) as AgentInfo[];
  const results = await Promise.allSettled(agents.map((agent) => measure(agent, numberArg(args, "bytes", 2_000_000))));
  console.log(JSON.stringify(results.map((result, index) => result.status === "fulfilled"
    ? result.value : { agentId: agents[index]?.id, error: result.reason instanceof Error ? result.reason.message : String(result.reason) }), null, 2));
} else {
  console.log("Uso: network-test agent [--port 4090] | run <agents.json> [--bytes 2000000]");
  process.exit(1);
}
