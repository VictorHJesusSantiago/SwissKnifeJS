import { readFile } from "node:fs/promises";
import { parseArgs, numberArg, stringArg } from "../../core/src/args.js";
import { comparePng, type DiffResult } from "./diff.js";
import type { Region } from "./regionTolerance.js";
import { parseViewports, pathForViewport, type Viewport } from "./viewports.js";
import { runInteractiveApproval, type PendingDiff } from "./interactiveApproval.js";
import { writeHtmlReport, type ReportEntry } from "./htmlReport.js";

interface ManifestEntry {
  name: string;
  baseline: string;
  actual: string;
  diff?: string;
}

async function loadRegions(path: string | undefined): Promise<Region[]> {
  if (!path) return [];
  const raw = await readFile(path, "utf8");
  const parsed = JSON.parse(raw) as Region[];
  if (!Array.isArray(parsed)) throw new Error(`Arquivo de regiões inválido: ${path}`);
  return parsed;
}

async function loadManifest(path: string): Promise<ManifestEntry[]> {
  const raw = await readFile(path, "utf8");
  const parsed = JSON.parse(raw) as ManifestEntry[];
  if (!Array.isArray(parsed)) throw new Error(`Manifesto inválido: ${path}`);
  return parsed;
}

async function runCompare(args: ReturnType<typeof parseArgs>, hasSubcommand: boolean): Promise<void> {
  const positional = args._ as string[];
  const [baseline, actual] = hasSubcommand ? positional.slice(1) : positional;
  if (!baseline || !actual)
    throw new Error("Uso: visual-regression compare <baseline.png> <actual.png> [--diff diff.png] [--threshold .1] [--max-ratio 0] [--regions regions.json] [--viewports \"desktop:1440x900,mobile:375x667\"]");
  const diffPath = stringArg(args, "diff", "diff.png");
  const threshold = numberArg(args, "threshold", 0.1);
  const maxRatio = numberArg(args, "max-ratio", 0);
  const regions = await loadRegions(typeof args.regions === "string" ? args.regions : undefined);
  const viewportsSpec = typeof args.viewports === "string" ? args.viewports : undefined;

  if (!viewportsSpec) {
    const result = await comparePng(baseline, actual, diffPath, threshold, maxRatio, regions);
    console.log(JSON.stringify(result, null, 2));
    if (!result.passed) process.exitCode = 1;
    return;
  }

  const viewports = parseViewports(viewportsSpec);
  const results: Record<string, DiffResult> = {};
  let anyFailed = false;
  for (const viewport of viewports) {
    const viewportBaseline = pathForViewport(baseline, viewport);
    const viewportActual = pathForViewport(actual, viewport);
    const viewportDiff = pathForViewport(diffPath, viewport);
    const result = await comparePng(viewportBaseline, viewportActual, viewportDiff, threshold, maxRatio, regions);
    results[viewport.name] = result;
    if (!result.passed) anyFailed = true;
  }
  console.log(JSON.stringify(results, null, 2));
  if (anyFailed) process.exitCode = 1;
}

async function runApprove(args: ReturnType<typeof parseArgs>): Promise<void> {
  const positional = args._ as string[];
  const manifestPath = positional[1];
  if (!manifestPath) throw new Error("Uso: visual-regression approve <manifest.json> [--threshold .1] [--max-ratio 0]");
  const threshold = numberArg(args, "threshold", 0.1);
  const maxRatio = numberArg(args, "max-ratio", 0);
  const manifest = await loadManifest(manifestPath);
  const pending: PendingDiff[] = [];
  for (const entry of manifest) {
    const diffPath = entry.diff ?? `${entry.name}.diff.png`;
    const result = await comparePng(entry.baseline, entry.actual, diffPath, threshold, maxRatio);
    if (!result.passed) pending.push({ name: entry.name, baselinePath: entry.baseline, actualPath: entry.actual, diffPath, result });
  }
  if (pending.length === 0) {
    console.log("Nenhuma regressão pendente de aprovação.");
    return;
  }
  const outcomes = await runInteractiveApproval(pending);
  console.log(JSON.stringify(outcomes, null, 2));
}

async function runReport(args: ReturnType<typeof parseArgs>): Promise<void> {
  const positional = args._ as string[];
  const manifestPath = positional[1];
  if (!manifestPath) throw new Error("Uso: visual-regression report <manifest.json> [--out report.html] [--threshold .1] [--max-ratio 0]");
  const outPath = stringArg(args, "out", "visual-report.html");
  const threshold = numberArg(args, "threshold", 0.1);
  const maxRatio = numberArg(args, "max-ratio", 0);
  const manifest = await loadManifest(manifestPath);
  const entries: ReportEntry[] = [];
  for (const entry of manifest) {
    const diffPath = entry.diff ?? `${entry.name}.diff.png`;
    const result = await comparePng(entry.baseline, entry.actual, diffPath, threshold, maxRatio);
    entries.push({ name: entry.name, baselinePath: entry.baseline, actualPath: entry.actual, diffPath, result });
  }
  await writeHtmlReport(outPath, entries);
  console.log(`Relatório gerado em ${outPath}`);
  if (entries.some((entry) => !entry.result.passed)) process.exitCode = 1;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const positional = args._ as string[];
  const command = positional[0];

  if (command === "approve") return runApprove(args);
  if (command === "report") return runReport(args);
  if (command === "compare") return runCompare(args, true);
  // Compatibilidade retroativa: `visual-regression <baseline> <actual>` == `compare`.
  return runCompare(args, false);
}

await main();
