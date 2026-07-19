import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { answerQuestion } from "../packages/faq-bot/src/engine.js";
import { levenshtein, rankFaqs, similarity } from "../packages/faq-bot/src/search.js";
import { exportFaqMarkdown, importFaqMarkdown } from "../packages/faq-bot/src/faqMarkdown.js";
import { listUnanswered, promoteUnanswered, recordUnanswered } from "../packages/faq-bot/src/learning.js";
import { buildReport, recordOutcome } from "../packages/faq-bot/src/metrics.js";

describe("FAQ", () => {
  const faqs = [{ question: "Redefinir senha", keywords: ["senha", "login"], answer: "Troque aqui" }];
  it("encontra resposta por palavra-chave", () => expect(answerQuestion("esqueci a senha", faqs).answer).toBe("Troque aqui"));
  it("encaminha pergunta desconhecida", () => expect(answerQuestion("quero café", faqs).category).toBe("triagem"));
  it("tolera erro de digitação", () => expect(answerQuestion("esqueci a senhs", faqs).answer).toBe("Troque aqui"));
});

describe("busca fuzzy", () => {
  it("calcula distância de Levenshtein", () => {
    expect(levenshtein("senha", "senha")).toBe(0);
    expect(levenshtein("senha", "senhs")).toBe(1);
    expect(levenshtein("", "abc")).toBe(3);
  });
  it("calcula similaridade normalizada", () => {
    expect(similarity("senha", "senha")).toBe(1);
    expect(similarity("senha", "senhs")).toBeCloseTo(0.8);
  });
  it("ranqueia FAQs por relevância", () => {
    const faqs = [
      { question: "Como redefinir minha senha?", keywords: ["senha", "acesso"], answer: "A", category: "acesso" },
      { question: "Qual o status de um incidente?", keywords: ["incidente", "status"], answer: "B", category: "incidente" }
    ];
    const ranked = rankFaqs("preciso redefinir a senha", faqs);
    expect(ranked[0]?.faq.answer).toBe("A");
    expect(ranked[0]!.score).toBeGreaterThan(ranked[1]!.score);
  });
});

describe("aprendizado incremental", () => {
  it("registra, lista e promove perguntas sem resposta", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sk-faq-learning-"));
    const unansweredPath = join(dir, "unanswered.json");
    const faqPath = join(dir, "faqs.json");
    await import("node:fs/promises").then((fs) => fs.writeFile(faqPath, "[]", "utf8"));

    await recordUnanswered(unansweredPath, "Como cancelo minha assinatura?");
    await recordUnanswered(unansweredPath, "Como cancelo minha assinatura?");
    const entries = await listUnanswered(unansweredPath);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.count).toBe(2);

    const faqs = await promoteUnanswered(unansweredPath, faqPath, entries[0]!.id, {
      question: "Como cancelo minha assinatura?", answer: "Acesse o portal do cliente.", keywords: ["cancelar", "assinatura"]
    });
    expect(faqs).toHaveLength(1);
    expect(await listUnanswered(unansweredPath)).toHaveLength(0);
  });
});

describe("exportação e importação Markdown", () => {
  it("exporta e reimporta preservando categorias e tags", () => {
    const faqs = [
      { question: "Como redefinir minha senha?", keywords: ["senha", "acesso"], answer: "Use o link de recuperação.", category: "acesso" },
      { question: "Qual o status de um incidente?", keywords: ["incidente"], answer: "Consulte a página de status.", category: "incidente" }
    ];
    const markdown = exportFaqMarkdown(faqs);
    expect(markdown).toContain("## acesso");
    expect(markdown).toContain("### Como redefinir minha senha?");
    expect(markdown).toContain("Tags: senha, acesso");

    const imported = importFaqMarkdown(markdown);
    expect(imported).toEqual(faqs);
  });
});

describe("métricas", () => {
  it("contabiliza perguntas e taxa de resolução", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sk-faq-metrics-"));
    const metricsPath = join(dir, "metrics.json");
    await recordOutcome(metricsPath, "Como redefinir minha senha?", true);
    await recordOutcome(metricsPath, "Como redefinir minha senha?", true);
    await recordOutcome(metricsPath, "Quero café", false);
    const report = await buildReport(metricsPath);
    expect(report.totalQuestions).toBe(3);
    expect(report.resolved).toBe(2);
    expect(report.escalated).toBe(1);
    expect(report.resolutionRate).toBeCloseTo(0.6667, 3);
    expect(report.topQuestions[0]?.question).toBe("como redefinir minha senha?");
    expect(report.topQuestions[0]?.count).toBe(2);
  });
});
