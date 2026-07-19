import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildTrends, renderTrendReportMarkdown, writeTrendReport } from "../packages/e2e-flakiness/src/trendReport.js";
import type { TestHistory } from "../packages/e2e-flakiness/src/report.js";

function history(): TestHistory {
  return {
    runs: [
      { at: "2026-07-01T00:00:00.000Z", tests: [{ title: "a", outcome: "passed", durationMs: 10 }, { title: "b", outcome: "passed", durationMs: 10 }] },
      { at: "2026-07-02T00:00:00.000Z", tests: [{ title: "a", outcome: "failed", durationMs: 10 }, { title: "b", outcome: "passed", durationMs: 10 }] },
      { at: "2026-07-03T00:00:00.000Z", tests: [{ title: "a", outcome: "passed", durationMs: 10 }, { title: "b", outcome: "passed", durationMs: 10 }] }
    ]
  };
}

describe("trendReport", () => {
  it("calcula taxa de flakiness por teste ao longo das execuções", () => {
    const trends = buildTrends(history(), 30);
    const a = trends.find((t) => t.title === "a")!;
    const b = trends.find((t) => t.title === "b")!;
    expect(a.flakinessRate).toBeCloseTo(1 / 3);
    expect(b.flakinessRate).toBe(0);
    expect(a.sparkline).toHaveLength(3);
  });

  it("ordena testes do mais flaky para o menos flaky", () => {
    const trends = buildTrends(history(), 30);
    expect(trends[0]!.title).toBe("a");
  });

  it("respeita a janela das últimas N execuções", () => {
    const trends = buildTrends(history(), 1);
    const a = trends.find((t) => t.title === "a")!;
    expect(a.points).toHaveLength(1);
  });

  it("gera relatório Markdown com tabela e SVG inline", () => {
    const md = renderTrendReportMarkdown(history(), 30);
    expect(md).toContain("# Relatório de tendência de flakiness");
    expect(md).toContain("| Teste | Taxa de flakiness | Tendência (ASCII) |");
    expect(md).toContain("<svg");
  });

  describe("escrita em disco", () => {
    let dir: string;
    beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), "e2e-trend-")); });
    afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

    it("escreve o relatório no arquivo informado", async () => {
      const file = join(dir, "nested", "trend.md");
      const content = await writeTrendReport(file, history(), 30);
      const onDisk = await readFile(file, "utf8");
      expect(onDisk).toBe(content);
      expect(onDisk).toContain("# Relatório de tendência de flakiness");
    });
  });
});
