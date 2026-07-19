import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { extractActionItems } from "../packages/sprint-retro/src/actionItems.js";
import { exportMarkdown } from "../packages/sprint-retro/src/exportMarkdown.js";
import { markdownToPlainLines, textToPdf } from "../packages/sprint-retro/src/exportPdf.js";
import type { SprintData } from "../packages/sprint-retro/src/providers.js";
import { categorizeNotes, resolveTemplate, RETRO_TEMPLATES } from "../packages/sprint-retro/src/retroTemplates.js";
import { compareSprints, computeMetrics, loadHistory, recordSprint } from "../packages/sprint-retro/src/sprintComparison.js";

const sampleData: SprintData = {
  name: "Sprint 5",
  start: "2026-06-01",
  end: "2026-06-14",
  items: [
    { id: "1", title: "Entrega A", type: "Story", status: "Done", points: 5, labels: [] },
    { id: "2", title: "Entrega B", type: "Bug", status: "Closed", points: 2, labels: [] },
    { id: "3", title: "Pendente", type: "Story", status: "Doing", points: 3, labels: [] }
  ]
};

describe("actionItems", () => {
  it("extrai action items de padrões TODO/action/menção/verbo", () => {
    const notes = [
      "TODO: revisar pipeline de deploy",
      "action: atualizar documentação da API",
      "@joao vai investigar a lentidão do build",
      "Corrigir o teste flaky de checkout",
      "Apenas um comentário qualquer sem padrão"
    ];
    const items = extractActionItems(notes);
    expect(items).toHaveLength(4);
    expect(items[0]).toMatchObject({ text: "revisar pipeline de deploy" });
    expect(items[2]).toMatchObject({ assignee: "joao", text: "investigar a lentidão do build" });
    expect(items[3]).toMatchObject({ text: "Corrigir o teste flaky de checkout" });
  });

  it("ignora linhas vazias e sem padrão reconhecido", () => {
    expect(extractActionItems(["", "   ", "apenas texto normal"])).toHaveLength(0);
  });
});

describe("sprintComparison", () => {
  let dir: string;
  let historyPath: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "sprint-retro-"));
    historyPath = join(dir, "history.json");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("computa métricas a partir dos dados da sprint", () => {
    const metrics = computeMetrics(sampleData);
    expect(metrics).toMatchObject({ completedItems: 2, totalItems: 3, completedPoints: 7, bugs: 1 });
  });

  it("compara com sprint anterior registrada no histórico e calcula tendência/delta", async () => {
    const previousMetrics = computeMetrics({ ...sampleData, name: "Sprint 4", items: sampleData.items.slice(0, 1) });
    await recordSprint(historyPath, previousMetrics);

    const currentMetrics = computeMetrics(sampleData);
    const history = await loadHistory(historyPath);
    const comparison = compareSprints(currentMetrics, history);

    expect(comparison.previous?.name).toBe("Sprint 4");
    const completedDelta = comparison.deltas.find((delta) => delta.metric === "Itens concluídos");
    expect(completedDelta?.trend).toBe("up");
    expect(completedDelta?.current).toBe(2);
    expect(completedDelta?.previous).toBe(1);
  });

  it("retorna comparação vazia quando não há histórico anterior", async () => {
    const metrics = computeMetrics(sampleData);
    const history = await loadHistory(historyPath);
    const comparison = compareSprints(metrics, history);
    expect(comparison.deltas).toHaveLength(0);
  });
});

describe("retroTemplates", () => {
  it("resolve template padrão e templates nomeados", () => {
    expect(resolveTemplate(undefined).id).toBe("start-stop-continue");
    expect(resolveTemplate("4ls").categories).toEqual(RETRO_TEMPLATES["4ls"].categories);
  });

  it("lança erro para template desconhecido", () => {
    expect(() => resolveTemplate("invalido")).toThrow();
  });

  it("categoriza notas conforme template (case-insensitive)", () => {
    const template = resolveTemplate("mad-sad-glad");
    const categorized = categorizeNotes(template, { mad: ["Build quebrou 3x"], Glad: ["Deploy sem incidentes"] });
    expect(categorized).toEqual([
      { category: "Mad", text: "Build quebrou 3x" },
      { category: "Glad", text: "Deploy sem incidentes" }
    ]);
  });
});

describe("exportMarkdown", () => {
  it("inclui template, comparação e action items no markdown final", () => {
    const template = resolveTemplate("start-stop-continue");
    const categorized = categorizeNotes(template, { Start: ["Pair programming"], Stop: ["Reuniões sem pauta"] });
    const markdown = exportMarkdown({
      data: sampleData,
      actionItems: [{ text: "revisar pipeline", assignee: "joao", source: "TODO: revisar pipeline" }],
      comparison: { previous: { name: "Sprint 4", completedItems: 1, totalItems: 1, completedPoints: 1, totalPoints: 1, bugs: 0 }, deltas: [{ metric: "Itens concluídos", current: 2, previous: 1, deltaPct: 100, trend: "up" }] },
      template,
      categorized
    });
    expect(markdown).toContain("## Start / Stop / Continue");
    expect(markdown).toContain("Pair programming");
    expect(markdown).toContain("## Comparação com sprint anterior");
    expect(markdown).toContain("## Action Items");
    expect(markdown).toContain("- [ ] revisar pipeline (@joao)");
  });
});

describe("exportPdf", () => {
  it("gera um Buffer com cabeçalho e rodapé válidos de PDF", () => {
    const lines = markdownToPlainLines("# Título\n\nUma linha qualquer\n**negrito**");
    const pdf = textToPdf(lines);
    const text = pdf.toString("latin1");
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text.trim().endsWith("%%EOF")).toBe(true);
    expect(text).toContain("/Type /Catalog");
    expect(text).toContain("/Type /Page");
  });

  it("gera múltiplas páginas quando o conteúdo excede uma página", () => {
    const lines = Array.from({ length: 120 }, (_, index) => `Linha ${index}`);
    const pdf = textToPdf(lines);
    const text = pdf.toString("latin1");
    const pageMatches = text.match(/\/Type \/Page\b/g) ?? [];
    expect(pageMatches.length).toBeGreaterThan(1);
  });
});
