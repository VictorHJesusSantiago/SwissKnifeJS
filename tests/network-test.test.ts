import { describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { computeJitterStats } from "../packages/network-test/src/jitterTest.js";
import { parseTracerouteLine } from "../packages/network-test/src/traceroute.js";
import {
  compareResults, averageHistory, compareLastAgainstAverage, appendHistory, loadHistory,
  type HistoryEntry
} from "../packages/network-test/src/comparisonReport.js";
import { computeNextRun, computeNextRuns, startBurstScheduler } from "../packages/network-test/src/burstScheduler.js";

describe("computeJitterStats", () => {
  it("calcula perda, média e jitter a partir de RTTs simulados", () => {
    const stats = computeJitterStats([10, 12, undefined, 14, 11]);
    expect(stats.packetsSent).toBe(5);
    expect(stats.packetsReceived).toBe(4);
    expect(stats.lossPercent).toBe(20);
    expect(stats.avgLatencyMs).toBeCloseTo((10 + 12 + 14 + 11) / 4, 2);
    // jitter: |12-10| + |14-12| + |11-14| = 2 + 2 + 3 = 7 / 3
    expect(stats.jitterMs).toBeCloseTo(7 / 3, 2);
    expect(stats.minLatencyMs).toBe(10);
    expect(stats.maxLatencyMs).toBe(14);
  });

  it("retorna zeros quando todos os pacotes são perdidos", () => {
    const stats = computeJitterStats([undefined, undefined]);
    expect(stats.packetsReceived).toBe(0);
    expect(stats.lossPercent).toBe(100);
    expect(stats.avgLatencyMs).toBe(0);
    expect(stats.jitterMs).toBe(0);
  });

  it("não perde nenhum pacote quando todos respondem", () => {
    const stats = computeJitterStats([5, 5, 5]);
    expect(stats.lossPercent).toBe(0);
    expect(stats.jitterMs).toBe(0);
  });
});

describe("parseTracerouteLine", () => {
  it("extrai endereço e RTT de uma linha válida", () => {
    const hop = parseTracerouteLine("  1  10.0.0.1  1.234 ms  1.111 ms  1.050 ms", 1);
    expect(hop.address).toBe("10.0.0.1");
    expect(hop.rttMs).toBeCloseTo(1.234, 3);
    expect(hop.timedOut).toBe(false);
  });

  it("marca timeout quando não há resposta", () => {
    const hop = parseTracerouteLine("  3  * * * Request timed out.", 3);
    expect(hop.timedOut).toBe(true);
    expect(hop.address).toBeUndefined();
  });
});

describe("compareResults", () => {
  it("detecta regressão quando latência piora acima do limiar", () => {
    const report = compareResults({ latencyMs: 20, downloadMbps: 100 }, { latencyMs: 30, downloadMbps: 100 });
    const latency = report.metrics.find((m) => m.metric === "latencyMs")!;
    expect(latency.regression).toBe(true);
    expect(latency.deltaPercent).toBeCloseTo(50, 1);
    expect(report.hasRegression).toBe(true);
  });

  it("não marca regressão quando throughput melhora", () => {
    const report = compareResults({ downloadMbps: 100 }, { downloadMbps: 150 });
    expect(report.metrics[0]!.regression).toBe(false);
  });

  it("marca regressão quando throughput piora acima do limiar", () => {
    const report = compareResults({ downloadMbps: 100 }, { downloadMbps: 50 });
    expect(report.metrics[0]!.regression).toBe(true);
  });

  it("respeita o limiar de tolerância customizado", () => {
    const report = compareResults({ latencyMs: 100 }, { latencyMs: 105 }, { thresholdPercent: 10 });
    expect(report.metrics[0]!.regression).toBe(false);
  });
});

describe("averageHistory / compareLastAgainstAverage", () => {
  const entry = (over: Partial<HistoryEntry>): HistoryEntry => ({
    id: "x", measuredAt: new Date().toISOString(), latencyMs: 10, jitterMs: 1,
    lossPercent: 0, downloadMbps: 100, uploadMbps: 50, ...over
  });

  it("calcula a média de várias execuções", () => {
    const avg = averageHistory([entry({ latencyMs: 10 }), entry({ latencyMs: 20 })]);
    expect(avg.latencyMs).toBe(15);
  });

  it("retorna undefined quando não há histórico suficiente", () => {
    expect(compareLastAgainstAverage([entry({})])).toBeUndefined();
  });

  it("compara a última execução contra a média das anteriores e destaca regressão", () => {
    const history = [entry({ id: "a", latencyMs: 10 }), entry({ id: "b", latencyMs: 10 }), entry({ id: "c", latencyMs: 50 })];
    const report = compareLastAgainstAverage(history)!;
    expect(report.hasRegression).toBe(true);
  });
});

describe("persistência de histórico local (JSON)", () => {
  it("grava e lê o histórico de execuções em disco", async () => {
    const dir = await mkdtemp(join(tmpdir(), "network-test-history-"));
    const path = join(dir, "history.json");
    try {
      await appendHistory({ id: "run-1", measuredAt: new Date().toISOString(), latencyMs: 10, jitterMs: 1, lossPercent: 0, downloadMbps: 90, uploadMbps: 40 }, path);
      await appendHistory({ id: "run-2", measuredAt: new Date().toISOString(), latencyMs: 12, jitterMs: 2, lossPercent: 1, downloadMbps: 80, uploadMbps: 35 }, path);
      const history = await loadHistory(path);
      expect(history).toHaveLength(2);
      expect(history[0]!.id).toBe("run-1");
      expect(history[1]!.id).toBe("run-2");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("agendamento cron local (burstScheduler)", () => {
  it("calcula a próxima execução a partir de uma expressão cron", () => {
    const base = new Date("2026-07-09T12:00:00.000Z");
    const next = computeNextRun("*/10 * * * *", base);
    expect(next.getTime()).toBeGreaterThan(base.getTime());
    expect(next.getUTCMinutes() % 10).toBe(0);
  });

  it("calcula múltiplas próximas execuções em ordem crescente", () => {
    const base = new Date("2026-07-09T12:00:00.000Z");
    const runs = computeNextRuns("0 * * * *", 3, base);
    expect(runs).toHaveLength(3);
    expect(runs[0]!.getTime()).toBeLessThan(runs[1]!.getTime());
    expect(runs[1]!.getTime()).toBeLessThan(runs[2]!.getTime());
  });

  it("permite parar o agendamento local antes de qualquer disparo, sem depender de infraestrutura externa", () => {
    let calls = 0;
    const handle = startBurstScheduler({
      cronExpression: "*/1 * * * *",
      task: () => { calls += 1; },
      maxRuns: 1
    });
    handle.stop();
    expect(handle.runsCompleted()).toBe(0);
    expect(calls).toBe(0);
  });
});
