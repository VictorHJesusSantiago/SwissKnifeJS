import { homedir } from "node:os";
import { join } from "node:path";
import { readJsonFile, writeJsonAtomic } from "../../core/src/io.js";

export interface HistoryEntry {
  id: string;
  measuredAt: string;
  latencyMs: number;
  jitterMs: number;
  lossPercent: number;
  downloadMbps: number;
  uploadMbps: number;
  [key: string]: unknown;
}

export const DEFAULT_HISTORY_PATH = join(homedir(), ".swissknife", "network-test-history.json");

export async function loadHistory(path = DEFAULT_HISTORY_PATH): Promise<HistoryEntry[]> {
  return readJsonFile<HistoryEntry[]>(path, []);
}

export async function appendHistory(entry: HistoryEntry, path = DEFAULT_HISTORY_PATH): Promise<HistoryEntry[]> {
  const history = await loadHistory(path);
  history.push(entry);
  await writeJsonAtomic(path, history);
  return history;
}

export interface MetricComparison {
  metric: string;
  baseline: number;
  current: number;
  deltaPercent: number;
  regression: boolean;
}

export interface ComparisonReport {
  baselineLabel: string;
  currentLabel: string;
  metrics: MetricComparison[];
  hasRegression: boolean;
}

/** Métricas em que um valor MAIOR é melhor (ex.: throughput). As demais assumem que menor é melhor (latência, jitter, perda). */
const HIGHER_IS_BETTER = new Set(["downloadMbps", "uploadMbps"]);

/** Limiar de variação (%) acima do qual uma métrica é considerada regressão de performance. */
const REGRESSION_THRESHOLD_PERCENT = 10;

/** Compara duas execuções (ou uma execução contra um baseline agregado) e destaca regressões por métrica. */
export function compareResults(
  baseline: Record<string, number>,
  current: Record<string, number>,
  options: { baselineLabel?: string; currentLabel?: string; thresholdPercent?: number } = {}
): ComparisonReport {
  const threshold = options.thresholdPercent ?? REGRESSION_THRESHOLD_PERCENT;
  const metrics: MetricComparison[] = [];
  for (const metric of Object.keys(current)) {
    if (!(metric in baseline)) continue;
    const baselineValue = baseline[metric]!;
    const currentValue = current[metric]!;
    const deltaPercent = baselineValue === 0 ? 0 : Number((((currentValue - baselineValue) / Math.abs(baselineValue)) * 100).toFixed(2));
    const worse = HIGHER_IS_BETTER.has(metric) ? deltaPercent < 0 : deltaPercent > 0;
    const regression = worse && Math.abs(deltaPercent) >= threshold;
    metrics.push({ metric, baseline: baselineValue, current: currentValue, deltaPercent, regression });
  }
  return {
    baselineLabel: options.baselineLabel ?? "baseline",
    currentLabel: options.currentLabel ?? "atual",
    metrics,
    hasRegression: metrics.some((m) => m.regression)
  };
}

/** Calcula a média histórica das métricas numéricas de uma lista de execuções. */
export function averageHistory(history: HistoryEntry[]): Record<string, number> {
  if (history.length === 0) return {};
  const numericKeys = ["latencyMs", "jitterMs", "lossPercent", "downloadMbps", "uploadMbps"] as const;
  const result: Record<string, number> = {};
  for (const key of numericKeys) {
    const values = history.map((entry) => entry[key]).filter((value): value is number => typeof value === "number");
    if (values.length === 0) continue;
    result[key] = Number((values.reduce((sum, n) => sum + n, 0) / values.length).toFixed(2));
  }
  return result;
}

/** Compara a última execução do histórico contra a média das anteriores. */
export function compareLastAgainstAverage(history: HistoryEntry[], thresholdPercent?: number): ComparisonReport | undefined {
  if (history.length < 2) return undefined;
  const last = history[history.length - 1]!;
  const previous = history.slice(0, -1);
  const baseline = averageHistory(previous);
  const current = averageHistory([last]);
  return compareResults(baseline, current, { baselineLabel: "média histórica", currentLabel: last.id, thresholdPercent });
}
