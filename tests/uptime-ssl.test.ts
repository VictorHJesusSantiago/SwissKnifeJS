import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { buildAlertEvents, type CheckResult } from "../packages/uptime-ssl/src/monitor.js";
import { appendHistory, readHistory } from "../packages/uptime-ssl/src/history.js";
import { toCsv, toJson, exportHistory } from "../packages/uptime-ssl/src/export.js";
import { generateDashboard } from "../packages/uptime-ssl/src/dashboard.js";
import { lookupRecords, compareResolvers } from "../packages/uptime-ssl/src/dns.js";

function makeResult(overrides: Partial<CheckResult> = {}): CheckResult {
  return {
    name: "site", url: "https://example.com", ok: true, status: 200,
    latencyMs: 42, checkedAt: "2026-01-01T00:00:00.000Z", ...overrides
  };
}

describe("alertas", () => {
  it("gera evento de queda quando o site está fora do ar", () => {
    const events = buildAlertEvents([makeResult({ ok: false, status: 500, error: "HTTP 500" })], 14);
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe("down");
  });

  it("gera evento de expiração de SSL dentro do limite configurado", () => {
    const events = buildAlertEvents([
      makeResult({ certificate: { validTo: "2026-01-10T00:00:00.000Z", daysRemaining: 5 } })
    ], 14);
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe("ssl-expiring");
    expect(events[0]?.daysRemaining).toBe(5);
  });

  it("não gera alerta quando tudo está saudável", () => {
    const events = buildAlertEvents([
      makeResult({ certificate: { validTo: "2027-01-01T00:00:00.000Z", daysRemaining: 300 } })
    ], 14);
    expect(events).toHaveLength(0);
  });
});

describe("histórico", () => {
  it("grava e lê o histórico em ndjson", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sk-uptime-"));
    const path = join(dir, "history.ndjson");
    await appendHistory(path, [makeResult(), makeResult({ ok: false, status: 503 })]);
    const history = await readHistory(path);
    expect(history).toHaveLength(2);
    expect(history[1]?.status).toBe(503);
  });

  it("retorna lista vazia quando o arquivo não existe", async () => {
    expect(await readHistory(join(tmpdir(), "sk-uptime-inexistente", "x.ndjson"))).toEqual([]);
  });
});

describe("exportação", () => {
  const history = [makeResult(), makeResult({ ok: false, status: 500, error: "boom" })];

  it("exporta em CSV com cabeçalho", () => {
    const csv = toCsv(history);
    expect(csv.split("\n")[0]).toContain("name,url,ok,status");
    expect(csv).toContain("example.com");
  });

  it("exporta em JSON", () => {
    const json = toJson(history);
    expect(JSON.parse(json)).toHaveLength(2);
  });

  it("exportHistory delega para o formato correto", () => {
    expect(exportHistory(history, "csv")).toBe(toCsv(history));
    expect(exportHistory(history, "json")).toBe(toJson(history));
  });
});

describe("dashboard", () => {
  it("gera HTML standalone com SVG e sem histórico não quebra", () => {
    const html = generateDashboard([makeResult(), makeResult({ ok: false })]);
    expect(html).toContain("<svg");
    expect(html).toContain("uptime-ssl dashboard");
    expect(generateDashboard([])).toContain("Sem histórico disponível");
  });
});

describe("DNS", () => {
  it("retorna erro estruturado quando não há rede/resolver disponível", async () => {
    const results = await lookupRecords("example.invalid", ["A"], "127.0.0.1");
    expect(results).toHaveLength(1);
    expect(results[0]?.type).toBe("A");
    expect(results[0]?.error).toBeDefined();
  });

  it("compara múltiplos resolvers e reporta consistência", async () => {
    const comparisons = await compareResolvers("example.invalid", ["A"], ["127.0.0.1", "127.0.0.2"]);
    expect(comparisons).toHaveLength(1);
    expect(Object.keys(comparisons[0]?.byResolver ?? {})).toHaveLength(2);
  });
});
