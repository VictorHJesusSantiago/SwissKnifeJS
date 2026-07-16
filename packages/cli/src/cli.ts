import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { checkAllHealth, color, parseArgs, printOutput, runPlugin } from "@swissknife/core";
import { TOOLS, findTool } from "./tools.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..", "..");

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);

  if (!command || command === "help" || command === "--help") {
    printHelp();
    return;
  }

  if (command === "list") {
    const format = parseArgs(rest).format;
    printOutput(
      TOOLS.map((tool) => ({ name: tool.name, description: tool.description })),
      format === "json" ? "json" : "table"
    );
    return;
  }

  if (command === "health") {
    const checks = TOOLS.filter((tool) => tool.healthUrl).map((tool) => ({ name: tool.name, url: tool.healthUrl! }));
    const results = await checkAllHealth(checks);
    printOutput(results as unknown as Array<Record<string, unknown>>, "table");
    if (results.some((result) => result.status === "down")) process.exitCode = 1;
    return;
  }

  if (command === "plugin") {
    const [pluginName, ...pluginArgs] = rest;
    if (!pluginName) {
      console.error(color("Uso: swissknife plugin <nome> [...args]", "red"));
      process.exitCode = 1;
      return;
    }
    const pluginsDir = join(repoRoot, ".swissknife", "plugins");
    const found = await runPlugin(pluginsDir, pluginName, pluginArgs);
    if (!found) {
      console.error(color(`Plugin não encontrado: ${pluginName} (procurado em ${pluginsDir})`, "red"));
      process.exitCode = 1;
    }
    return;
  }

  const tool = findTool(command);
  if (!tool) {
    console.error(color(`Ferramenta desconhecida: ${command}`, "red"));
    printHelp();
    process.exitCode = 1;
    return;
  }

  const child = spawn("npx", ["tsx", join(repoRoot, tool.script), ...rest], {
    stdio: "inherit",
    cwd: repoRoot,
    shell: process.platform === "win32"
  });
  child.on("exit", (code) => {
    process.exitCode = code ?? 0;
  });
}

function printHelp(): void {
  console.log(color("swissknife <ferramenta> [...args]", "bold"));
  console.log("");
  console.log("Ferramentas disponíveis:");
  for (const tool of TOOLS) console.log(`  ${color(tool.name.padEnd(18), "cyan")} ${tool.description}`);
  console.log("");
  console.log("Comandos especiais:");
  console.log(`  ${color("list", "cyan")}                 lista as ferramentas (--format=json)`);
  console.log(`  ${color("health", "cyan")}               verifica o status de todas as ferramentas com servidor HTTP`);
  console.log(`  ${color("plugin <nome>", "cyan")}        executa um plugin de .swissknife/plugins`);
}

main().catch((error) => {
  console.error(color(String(error), "red"));
  process.exitCode = 1;
});
