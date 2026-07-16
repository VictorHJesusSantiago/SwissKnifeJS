import { randomUUID } from "node:crypto";
import { readJsonFile, writeJsonAtomic } from "../../core/src/io.js";
import type { Faq } from "./search.js";

export interface UnansweredEntry {
  id: string;
  question: string;
  count: number;
  firstSeenAt: string;
  lastSeenAt: string;
}

export async function recordUnanswered(path: string, question: string): Promise<UnansweredEntry> {
  const entries = await readJsonFile<UnansweredEntry[]>(path, []);
  const normalized = question.trim();
  const now = new Date().toISOString();
  const existing = entries.find((entry) => entry.question.toLowerCase() === normalized.toLowerCase());
  if (existing) {
    existing.count += 1;
    existing.lastSeenAt = now;
    await writeJsonAtomic(path, entries);
    return existing;
  }
  const entry: UnansweredEntry = { id: randomUUID(), question: normalized, count: 1, firstSeenAt: now, lastSeenAt: now };
  entries.push(entry);
  await writeJsonAtomic(path, entries);
  return entry;
}

export async function listUnanswered(path: string): Promise<UnansweredEntry[]> {
  const entries = await readJsonFile<UnansweredEntry[]>(path, []);
  return [...entries].sort((a, b) => b.count - a.count);
}

export async function promoteUnanswered(unansweredPath: string, faqPath: string, id: string, faq: Faq): Promise<Faq[]> {
  const entries = await readJsonFile<UnansweredEntry[]>(unansweredPath, []);
  const remaining = entries.filter((entry) => entry.id !== id);
  if (remaining.length === entries.length) throw new Error("Pergunta não encontrada na fila de triagem");
  const faqs = await readJsonFile<Faq[]>(faqPath, []);
  faqs.push(faq);
  await writeJsonAtomic(faqPath, faqs);
  await writeJsonAtomic(unansweredPath, remaining);
  return faqs;
}
