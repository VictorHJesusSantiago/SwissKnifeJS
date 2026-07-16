import { rankFaqs, type Faq } from "./search.js";

export type { Faq } from "./search.js";
export interface Match { answer: string; score: number; category?: string }

export function answerQuestion(text: string, faqs: Faq[], threshold = 0.25): Match {
  const [best] = rankFaqs(text, faqs);
  if (!best || best.score < threshold) {
    return {
      answer: "Não encontrei uma resposta segura. Encaminhei sua dúvida para a triagem humana.",
      score: 0,
      category: "triagem"
    };
  }
  return { answer: best.faq.answer, score: best.score, category: best.faq.category };
}
