import { describe, expect, it } from "vitest";
import { answerQuestion } from "../packages/faq-bot/src/engine.js";
describe("FAQ", () => {
  const faqs = [{ question: "Redefinir senha", keywords: ["senha", "login"], answer: "Troque aqui" }];
  it("encontra resposta por palavra-chave", () => expect(answerQuestion("esqueci a senha", faqs).answer).toBe("Troque aqui"));
  it("encaminha pergunta desconhecida", () => expect(answerQuestion("quero café", faqs).category).toBe("triagem"));
});
