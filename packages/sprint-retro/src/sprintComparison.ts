import { readJsonFile, writeJsonAtomic } from "../../core/src/io.js";
import type { SprintData } from "./providers.js";

export interface SprintMetrics {
  name: string;
  start?: string;
  end?: string;
  completedItems: number;
  totalItems: number;
  completedPoints: number;
  totalPoints: number;
  bugs: number;
}

export interface SprintHistory {
  sprints: SprintMetrics[];
}

export function computeMetrics(data: SprintData): SprintMetrics {
  const done = data.items.filter((item) => /done|closed|resolved|conclu/i.test(item.status));
  const bugs = data.items.filter((item) => /bug|defect|erro/i.test(item.type));
  return {
    name: data.name,
    start: data.start,
    end: data.end,
    completedItems: done.length,
    totalItems: data.items.length,
    completedPoints: done.reduce((sum, item) => sum + (item.points ?? 0), 0),
    totalPoints: data.items.reduce((sum, item) => sum + (item.points ?? 0), 0),
    bugs: bugs.length
  };
}

export async function loadHistory(path: string): Promise<SprintHistory> {
  return readJsonFile<SprintHistory>(path, { sprints: [] });
}

/** Grava/atualiza as métricas da sprint atual no histórico local (armazenamento em disco). */
export async function recordSprint(path: string, metrics: SprintMetrics): Promise<SprintHistory> {
  const history = await loadHistory(path);
  const sprints = [...history.sprints.filter((sprint) => sprint.name !== metrics.name), metrics];
  await writeJsonAtomic(path, { sprints });
  return { sprints };
}

export interface MetricDelta {
  metric: string;
  current: number;
  previous: number;
  deltaPct: number | null;
  trend: "up" | "down" | "flat";
}

export interface ComparisonResult {
  previous?: SprintMetrics;
  deltas: MetricDelta[];
}

/** Compara a sprint atual com a sprint imediatamente anterior registrada no histórico. */
export function compareSprints(current: SprintMetrics, history: SprintHistory): ComparisonResult {
  const previous = history.sprints.filter((sprint) => sprint.name !== current.name).at(-1);
  if (!previous) return { deltas: [] };

  const metricPairs: Array<[string, number, number]> = [
    ["Itens concluídos", current.completedItems, previous.completedItems],
    ["Pontos entregues", current.completedPoints, previous.completedPoints],
    ["Bugs/defeitos", current.bugs, previous.bugs]
  ];

  const deltas = metricPairs.map(([metric, curr, prev]) => {
    const deltaPct = prev === 0 ? null : ((curr - prev) / prev) * 100;
    const trend: MetricDelta["trend"] = curr === prev ? "flat" : curr > prev ? "up" : "down";
    return { metric, current: curr, previous: prev, deltaPct, trend };
  });

  return { previous, deltas };
}
