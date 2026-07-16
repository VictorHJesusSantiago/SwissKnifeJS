import { readFile } from "node:fs/promises";
import { parseArgs, stringArg, numberArg } from "../../core/src/args.js";
import { readJsonFile } from "../../core/src/io.js";
import { parsePlaywrightReport, recordAndAnalyze, type TestHistory } from "./report.js";
import { partitionByQuarantine, updateQuarantine } from "./quarantine.js";
import { writeTrendReport } from "./trendReport.js";

const args = parseArgs(process.argv.slice(2));
const reportFile = stringArg(args, "report", "playwright-report.json");
const historyFile = stringArg(args, "history", ".swissknife/flakiness.json");
const quarantineFile = stringArg(args, "quarantine", ".swissknife/quarantine.json");
const trendFile = stringArg(args, "trend-report", "");
const runsWindow = numberArg(args, "runs", 30);

const report = JSON.parse(await readFile(reportFile, "utf8"));
const tests = parsePlaywrightReport(report);
const flaky = await recordAndAnalyze(historyFile, tests, runsWindow);

const quarantineList = await updateQuarantine(quarantineFile, tests);
const { active, quarantined } = partitionByQuarantine(quarantineList, tests);

if (trendFile) {
  const history = await readJsonFile<TestHistory>(historyFile, { runs: [] });
  await writeTrendReport(trendFile, history, runsWindow);
}

console.log(JSON.stringify({
  analyzed: tests.length,
  flaky,
  quarantine: {
    total: quarantineList.entries.length,
    skipped: quarantined.map((test) => test.title)
  },
  trendReportFile: trendFile || undefined
}, null, 2));

// Falhas em testes ativos (não quarentenados) continuam falhando o processo;
// testes em quarentena são reportados separadamente e não bloqueiam a execução principal.
if (active.some((test) => test.outcome === "failed")) process.exitCode = 1;
