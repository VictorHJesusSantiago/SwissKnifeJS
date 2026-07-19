import type { CheckResult } from "./monitor.js";

export type ExportFormat = "csv" | "json";

const CSV_HEADER = [
  "name", "url", "ok", "status", "latencyMs", "checkedAt",
  "certValidTo", "certDaysRemaining", "certIssuer", "error"
];

function csvEscape(value: unknown): string {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(history: CheckResult[]): string {
  const rows = history.map((result) => [
    result.name,
    result.url,
    result.ok,
    result.status ?? "",
    result.latencyMs,
    result.checkedAt,
    result.certificate?.validTo ?? "",
    result.certificate?.daysRemaining ?? "",
    result.certificate?.issuer ?? "",
    result.error ?? ""
  ].map(csvEscape).join(","));
  return [CSV_HEADER.join(","), ...rows].join("\n") + (rows.length ? "\n" : "\n");
}

export function toJson(history: CheckResult[]): string {
  return `${JSON.stringify(history, null, 2)}\n`;
}

export function exportHistory(history: CheckResult[], format: ExportFormat): string {
  return format === "csv" ? toCsv(history) : toJson(history);
}
