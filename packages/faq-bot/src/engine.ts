export interface Faq { question: string; answer: string; keywords: string[]; category?: string }
export interface Match { answer: string; score: number; category?: string }

const normalize = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export function answerQuestion(text: string, faqs: Faq[], threshold = 0.25): Match {
  const words = new Set(normalize(text).split(/\W+/).filter((word) => word.length > 2));
  let best: Match = {
    score: 0,
    answer: "Não encontrei uma resposta segura. Encaminhei sua dúvida para a triagem humana.",
    category: "triagem"
  };
  for (const faq of faqs) {
    const terms = [...faq.keywords, ...faq.question.split(/\s+/)].map(normalize);
    const hits = terms.filter((term) => [...words].some((word) => word.includes(term) || term.includes(word))).length;
    const score = hits / Math.max(terms.length, 1);
    if (score > best.score) best = { answer: faq.answer, score, category: faq.category };
  }
  return best.score >= threshold ? best : { ...best, score: 0, category: "triagem" };
}
