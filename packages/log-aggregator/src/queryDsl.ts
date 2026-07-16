import type { LogEntry } from "./store.js";

type Predicate = (entry: LogEntry, extra: Record<string, unknown>) => boolean;

interface FieldTerm {
  kind: "field";
  field: string;
  value: string;
  negate: boolean;
}
interface RangeTerm {
  kind: "range";
  field: string;
  from?: string;
  to?: string;
  negate: boolean;
}
interface PhraseTerm {
  kind: "phrase";
  value: string;
  negate: boolean;
}
type Term = FieldTerm | RangeTerm | PhraseTerm;

/**
 * Query DSL: `campo:valor AND outro:valor OR "frase exata"`.
 * Suporta wildcards (`*`) em valores de campo, faixas de tempo `timestamp:[inicio TO fim]`
 * e negação com `-` (ex: `-level:debug`).
 */
export function parseQuery(query: string): { evaluate: (entry: LogEntry, extra?: Record<string, unknown>) => boolean; raw: string } {
  const tokens = tokenize(query);
  const orGroups = splitByOr(tokens);
  const compiledGroups = orGroups.map((group) => group.map(parseTerm).map(compileTerm));
  const evaluate = (entry: LogEntry, extra: Record<string, unknown> = {}): boolean => {
    if (!compiledGroups.length) return true;
    return compiledGroups.some((andGroup) => andGroup.every((predicate) => predicate(entry, extra)));
  };
  return { evaluate, raw: query };
}

/** Aplica uma query DSL diretamente sobre um array de entradas de log. */
export function runQuery(query: string, entries: LogEntry[]): LogEntry[] {
  const parsed = parseQuery(query);
  return entries.filter((entry) => parsed.evaluate(entry));
}

function tokenize(query: string): string[] {
  const tokens: string[] = [];
  const regex = /"[^"]*"|-?\S+:\[[^\]]*\]|\S+/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(query))) tokens.push(match[0]);
  return tokens;
}

function splitByOr(tokens: string[]): string[][] {
  const groups: string[][] = [[]];
  for (const token of tokens) {
    if (token.toUpperCase() === "OR") {
      groups.push([]);
      continue;
    }
    if (token.toUpperCase() === "AND") continue;
    groups[groups.length - 1]!.push(token);
  }
  return groups.filter((group) => group.length > 0);
}

function parseTerm(rawToken: string): Term {
  let token = rawToken;
  let negate = false;
  if (token.startsWith("-")) {
    negate = true;
    token = token.slice(1);
  }
  if (token.startsWith('"') && token.endsWith('"')) {
    return { kind: "phrase", value: token.slice(1, -1), negate };
  }
  const colonIndex = token.indexOf(":");
  if (colonIndex === -1) {
    return { kind: "phrase", value: token.replace(/^"|"$/g, ""), negate };
  }
  const field = token.slice(0, colonIndex);
  let value = token.slice(colonIndex + 1);
  if (value.startsWith("[") && value.endsWith("]")) {
    const inner = value.slice(1, -1);
    const parts = inner.split(/\s+TO\s+/i);
    const from = parts[0] && parts[0] !== "*" ? parts[0] : undefined;
    const to = parts[1] && parts[1] !== "*" ? parts[1] : undefined;
    return { kind: "range", field, from, to, negate };
  }
  if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
  return { kind: "field", field, value, negate };
}

function wildcardToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`, "i");
}

function fieldValue(entry: LogEntry, extra: Record<string, unknown>, field: string): unknown {
  if (field === "message") return entry.message;
  if (field === "level") return entry.level;
  if (field === "service") return entry.service;
  if (field === "traceId") return entry.traceId;
  if (field === "timestamp") return entry.timestamp;
  if (field.startsWith("metadata.")) return (entry.metadata as Record<string, unknown> | undefined)?.[field.slice(9)];
  return extra[field] ?? (entry as unknown as Record<string, unknown>)[field];
}

function compileTerm(term: Term): Predicate {
  if (term.kind === "phrase") {
    const needle = term.value.toLowerCase();
    const predicate: Predicate = (entry) => entry.message.toLowerCase().includes(needle);
    return term.negate ? (entry, extra) => !predicate(entry, extra) : predicate;
  }
  if (term.kind === "range") {
    const fromMs = term.from ? Date.parse(term.from) : undefined;
    const toMs = term.to ? Date.parse(term.to) : undefined;
    const predicate: Predicate = (entry, extra) => {
      const raw = fieldValue(entry, extra, term.field);
      const ms = typeof raw === "string" ? Date.parse(raw) : NaN;
      if (Number.isNaN(ms)) return false;
      if (fromMs !== undefined && ms < fromMs) return false;
      if (toMs !== undefined && ms > toMs) return false;
      return true;
    };
    return term.negate ? (entry, extra) => !predicate(entry, extra) : predicate;
  }
  const hasWildcard = term.value.includes("*") || term.value.includes("?");
  const matcher = hasWildcard ? wildcardToRegex(term.value) : undefined;
  const predicate: Predicate = (entry, extra) => {
    const raw = fieldValue(entry, extra, term.field);
    if (raw === undefined || raw === null) return false;
    const text = String(raw);
    return matcher ? matcher.test(text) : text.toLowerCase() === term.value.toLowerCase();
  };
  return term.negate ? (entry, extra) => !predicate(entry, extra) : predicate;
}
