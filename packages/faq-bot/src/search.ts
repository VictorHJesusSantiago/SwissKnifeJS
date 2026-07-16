export interface Faq { question: string; answer: string; keywords: string[]; category?: string }
export interface RankedFaq { faq: Faq; score: number }

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  let current = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min((current[j - 1] ?? 0) + 1, (previous[j] ?? 0) + 1, (previous[j - 1] ?? 0) + cost);
    }
    [previous, current] = [current, previous];
  }
  return previous[b.length] ?? 0;
}

export function similarity(a: string, b: string): number {
  if (!a.length && !b.length) return 1;
  if (a.includes(b) || b.includes(a)) return 1;
  const distance = levenshtein(a, b);
  return 1 - distance / Math.max(a.length, b.length);
}

export function normalize(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

export function tokenize(text: string): string[] {
  return normalize(text).split(/\W+/).filter((word) => word.length > 2);
}

export function rankFaqs(text: string, faqs: Faq[], matchThreshold = 0.72): RankedFaq[] {
  const words = tokenize(text);
  const ranked = faqs.map((faq) => {
    const terms = [...faq.keywords, ...faq.question.split(/\s+/)].map(normalize).filter(Boolean);
    if (!terms.length || !words.length) return { faq, score: 0 };
    const hits = terms.filter((term) => words.some((word) => similarity(word, term) >= matchThreshold)).length;
    return { faq, score: hits / terms.length };
  });
  return ranked.sort((a, b) => b.score - a.score);
}
