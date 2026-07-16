import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { TestHistory, Outcome } from "./report.js";

export interface TestTrendPoint {
  at: string;
  outcome: Outcome | "missing";
}

export interface TestTrend {
  title: string;
  points: TestTrendPoint[];
  flakinessRate: number;
  sparkline: string;
}

const SPARK_CHARS: Record<TestTrendPoint["outcome"], string> = {
  passed: "▁",
  failed: "█",
  skipped: "░",
  missing: "·"
};

/** Builds a per-test trend across the last N runs kept in local history (no external deps). */
export function buildTrends(history: TestHistory, windowSize = 30): TestTrend[] {
  const runs = history.runs.slice(-windowSize);
  const titles = new Set(runs.flatMap((run) => run.tests.map((test) => test.title)));
  return [...titles]
    .map((title) => {
      const points: TestTrendPoint[] = runs.map((run) => {
        const test = run.tests.find((entry) => entry.title === title);
        return { at: run.at, outcome: test ? test.outcome : "missing" };
      });
      const observed = points.filter((point) => point.outcome !== "missing");
      const failures = observed.filter((point) => point.outcome === "failed").length;
      const flakinessRate = observed.length ? Number((failures / observed.length).toFixed(3)) : 0;
      const sparkline = points.map((point) => SPARK_CHARS[point.outcome]).join("");
      return { title, points, flakinessRate, sparkline };
    })
    .sort((a, b) => b.flakinessRate - a.flakinessRate);
}

function svgSparkline(points: TestTrendPoint[]): string {
  const width = Math.max(points.length * 12, 12);
  const height = 24;
  const colors: Record<TestTrendPoint["outcome"], string> = {
    passed: "#2ecc71",
    failed: "#e74c3c",
    skipped: "#95a5a6",
    missing: "#ecf0f1"
  };
  const bars = points
    .map((point, index) => {
      const barHeight = point.outcome === "missing" ? 4 : point.outcome === "failed" ? height : height * 0.4;
      const x = index * 12;
      const y = height - barHeight;
      return `<rect x="${x}" y="${y}" width="9" height="${barHeight}" fill="${colors[point.outcome]}"><title>${point.at}: ${point.outcome}</title></rect>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" role="img" aria-label="tendência">${bars}</svg>`;
}

/** Renders a Markdown report with an ASCII sparkline and an inline SVG chart per test. */
export function renderTrendReportMarkdown(history: TestHistory, windowSize = 30): string {
  const trends = buildTrends(history, windowSize);
  const lines: string[] = [
    "# Relatório de tendência de flakiness",
    "",
    `Janela analisada: últimas ${Math.min(windowSize, history.runs.length)} execuções.`,
    "",
    "| Teste | Taxa de flakiness | Tendência (ASCII) |",
    "| --- | --- | --- |"
  ];
  for (const trend of trends) {
    lines.push(`| ${trend.title} | ${(trend.flakinessRate * 100).toFixed(1)}% | \`${trend.sparkline}\` |`);
  }
  lines.push("", "## Gráficos SVG por teste", "");
  for (const trend of trends) {
    lines.push(`### ${trend.title}`, "", svgSparkline(trend.points), "");
  }
  return lines.join("\n");
}

export async function writeTrendReport(file: string, history: TestHistory, windowSize = 30): Promise<string> {
  const content = renderTrendReportMarkdown(history, windowSize);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, content, "utf8");
  return content;
}
