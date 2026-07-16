import type { Faq } from "./search.js";

export function exportFaqMarkdown(faqs: Faq[]): string {
  const byCategory = new Map<string, Faq[]>();
  for (const faq of faqs) {
    const category = faq.category ?? "Geral";
    if (!byCategory.has(category)) byCategory.set(category, []);
    byCategory.get(category)!.push(faq);
  }
  const lines: string[] = ["# FAQ", ""];
  for (const [category, items] of byCategory) {
    lines.push(`## ${category}`, "");
    for (const faq of items) {
      lines.push(`### ${faq.question}`, "", faq.answer, "");
      if (faq.keywords.length) lines.push(`Tags: ${faq.keywords.join(", ")}`, "");
    }
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

export function importFaqMarkdown(markdown: string): Faq[] {
  const faqs: Faq[] = [];
  let category: string | undefined;
  let question: string | undefined;
  let answerLines: string[] = [];
  let keywords: string[] = [];

  const flush = () => {
    if (question) faqs.push({ question, answer: answerLines.join("\n").trim(), keywords, category });
    question = undefined;
    answerLines = [];
    keywords = [];
  };

  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.startsWith("## ")) {
      flush();
      category = line.slice(3).trim();
      continue;
    }
    if (line.startsWith("### ")) {
      flush();
      question = line.slice(4).trim();
      continue;
    }
    if (line.toLowerCase().startsWith("tags:")) {
      keywords = line.slice(5).split(",").map((tag) => tag.trim()).filter(Boolean);
      continue;
    }
    if (line.startsWith("# ")) continue;
    if (question) answerLines.push(rawLine);
  }
  flush();
  return faqs;
}
