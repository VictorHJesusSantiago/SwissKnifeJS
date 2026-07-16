import { readJsonFile, writeJsonAtomic } from "../../core/src/io.js";

export interface MetricsData { questions: Record<string, number>; resolved: number; escalated: number }

export interface MetricsReport {
  totalQuestions: number;
  resolved: number;
  escalated: number;
  resolutionRate: number;
  topQuestions: Array<{ question: string; count: number }>;
}

const emptyMetrics = (): MetricsData => ({ questions: {}, resolved: 0, escalated: 0 });

export async function recordOutcome(path: string, question: string, resolved: boolean): Promise<void> {
  const data = await readJsonFile<MetricsData>(path, emptyMetrics());
  const key = question.trim().toLowerCase();
  if (key) data.questions[key] = (data.questions[key] ?? 0) + 1;
  if (resolved) data.resolved += 1;
  else data.escalated += 1;
  await writeJsonAtomic(path, data);
}

export async function buildReport(path: string, limit = 10): Promise<MetricsReport> {
  const data = await readJsonFile<MetricsData>(path, emptyMetrics());
  const total = data.resolved + data.escalated;
  const topQuestions = Object.entries(data.questions)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([question, count]) => ({ question, count }));
  return {
    totalQuestions: total,
    resolved: data.resolved,
    escalated: data.escalated,
    resolutionRate: total ? Number((data.resolved / total).toFixed(4)) : 0,
    topQuestions
  };
}
