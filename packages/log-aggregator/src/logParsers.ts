export type ParsedFormat = "json" | "syslog5424" | "syslog3164" | "apacheCombined" | "apacheCommon" | "unknown";

export interface ParsedLog {
  format: ParsedFormat;
  timestamp?: string;
  level?: string;
  service?: string;
  message: string;
  fields: Record<string, unknown>;
}

const RFC5424 = /^<(\d{1,3})>(\d)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(?:\[[^\]]*\]|-)\s?(.*)$/;
const RFC3164 = /^<(\d{1,3})>(\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})\s+(\S+)\s+([^:\[]+)(?:\[(\d+)\])?:\s*(.*)$/;
const APACHE_COMBINED =
  /^(\S+)\s+(\S+)\s+(\S+)\s+\[([^\]]+)\]\s+"([^"]*)"\s+(\d{3})\s+(\S+)\s+"([^"]*)"\s+"([^"]*)"$/;
const APACHE_COMMON = /^(\S+)\s+(\S+)\s+(\S+)\s+\[([^\]]+)\]\s+"([^"]*)"\s+(\d{3})\s+(\S+)$/;

const SYSLOG_SEVERITY = ["emerg", "alert", "crit", "error", "warn", "notice", "info", "debug"];

function severityToLevel(priority: number): string {
  const severity = priority % 8;
  const name = SYSLOG_SEVERITY[severity] ?? "info";
  if (name === "emerg" || name === "alert" || name === "crit") return "error";
  if (name === "error") return "error";
  if (name === "warn") return "warn";
  if (name === "debug") return "debug";
  return "info";
}

function tryJson(line: string): ParsedLog | undefined {
  const trimmed = line.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return undefined;
  try {
    const value = JSON.parse(trimmed) as Record<string, unknown>;
    const message = typeof value.message === "string" ? value.message
      : typeof value.msg === "string" ? value.msg : trimmed;
    return {
      format: "json",
      timestamp: typeof value.timestamp === "string" ? value.timestamp
        : typeof value.time === "string" ? value.time : undefined,
      level: typeof value.level === "string" ? value.level : undefined,
      service: typeof value.service === "string" ? value.service : undefined,
      message,
      fields: value
    };
  } catch {
    return undefined;
  }
}

function tryRfc5424(line: string): ParsedLog | undefined {
  const match = RFC5424.exec(line.trim());
  if (!match) return undefined;
  const [, pri, , timestamp, host, app, procId, msgId, message] = match;
  return {
    format: "syslog5424",
    timestamp,
    level: severityToLevel(Number(pri)),
    service: app,
    message: message ?? "",
    fields: { priority: Number(pri), host, app, procId, msgId }
  };
}

function tryRfc3164(line: string): ParsedLog | undefined {
  const match = RFC3164.exec(line.trim());
  if (!match) return undefined;
  const [, pri, timestamp, host, app, procId, message] = match;
  return {
    format: "syslog3164",
    timestamp,
    level: severityToLevel(Number(pri)),
    service: (app ?? "").trim(),
    message: message ?? "",
    fields: { priority: Number(pri), host, procId }
  };
}

function tryApacheCombined(line: string): ParsedLog | undefined {
  const match = APACHE_COMBINED.exec(line.trim());
  if (!match) return undefined;
  const [, host, ident, user, timestamp, request, status, size, referer, userAgent] = match;
  const statusNum = Number(status);
  return {
    format: "apacheCombined",
    timestamp,
    level: statusNum >= 500 ? "error" : statusNum >= 400 ? "warn" : "info",
    service: "http",
    message: request ?? "",
    fields: { host, ident, user, request, status: statusNum, size, referer, userAgent }
  };
}

function tryApacheCommon(line: string): ParsedLog | undefined {
  const match = APACHE_COMMON.exec(line.trim());
  if (!match) return undefined;
  const [, host, ident, user, timestamp, request, status, size] = match;
  const statusNum = Number(status);
  return {
    format: "apacheCommon",
    timestamp,
    level: statusNum >= 500 ? "error" : statusNum >= 400 ? "warn" : "info",
    service: "http",
    message: request ?? "",
    fields: { host, ident, user, request, status: statusNum, size }
  };
}

/** Detecta o formato de uma linha de log e extrai campos estruturados. */
export function parseLogLine(line: string): ParsedLog {
  const trimmed = line.trim();
  if (!trimmed) return { format: "unknown", message: "", fields: {} };
  return (
    tryJson(trimmed) ??
    tryRfc5424(trimmed) ??
    tryRfc3164(trimmed) ??
    tryApacheCombined(trimmed) ??
    tryApacheCommon(trimmed) ?? {
      format: "unknown",
      message: trimmed,
      fields: {}
    }
  );
}

/** Detecta o formato dominante em um conjunto de linhas (amostra). */
export function detectFormat(lines: string[]): ParsedFormat {
  const counts = new Map<ParsedFormat, number>();
  for (const line of lines) {
    if (!line.trim()) continue;
    const { format } = parseLogLine(line);
    counts.set(format, (counts.get(format) ?? 0) + 1);
  }
  let best: ParsedFormat = "unknown";
  let bestCount = -1;
  for (const [format, count] of counts) {
    if (count > bestCount) {
      best = format;
      bestCount = count;
    }
  }
  return best;
}

/** Faz o parse de várias linhas, ignorando linhas vazias. */
export function parseLogLines(text: string): ParsedLog[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseLogLine);
}
