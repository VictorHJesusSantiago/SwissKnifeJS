import { readJsonFile, writeJsonAtomic } from "../../core/src/io.js";
import type { NamespaceRequest } from "./namespaces.js";

export interface UsageRecord {
  namespace: string;
  cpuUsed: number;
  memoryUsedGi: number;
  recordedAt: string;
}

export interface NamespaceUsageReport {
  namespace: string;
  status: NamespaceRequest["status"];
  cpuQuota: number;
  memoryQuotaGi: number;
  cpuUsed: number;
  memoryUsedGi: number;
  cpuUtilizationPct: number;
  memoryUtilizationPct: number;
}

export class UsageStore {
  constructor(private readonly file: string) {}
  list(): Promise<UsageRecord[]> { return readJsonFile(this.file, []); }
  async record(entry: Omit<UsageRecord, "recordedAt">): Promise<UsageRecord> {
    const all = await this.list();
    const full: UsageRecord = { ...entry, recordedAt: new Date().toISOString() };
    await writeJsonAtomic(this.file, [...all, full]);
    return full;
  }
}

function parseCpu(value: string): number {
  const trimmed = value.trim();
  if (trimmed.endsWith("m")) return Number.parseFloat(trimmed) / 1000;
  return Number.parseFloat(trimmed) || 0;
}

function parseMemoryGi(value: string): number {
  const trimmed = value.trim();
  if (trimmed.endsWith("Gi")) return Number.parseFloat(trimmed);
  if (trimmed.endsWith("Mi")) return Number.parseFloat(trimmed) / 1024;
  if (trimmed.endsWith("Ki")) return Number.parseFloat(trimmed) / (1024 * 1024);
  return Number.parseFloat(trimmed) || 0;
}

function latestUsage(records: UsageRecord[], namespace: string): UsageRecord | undefined {
  return records.filter((entry) => entry.namespace === namespace).sort((a, b) => a.recordedAt.localeCompare(b.recordedAt)).at(-1);
}

export function buildReport(namespaces: NamespaceRequest[], usage: UsageRecord[]): NamespaceUsageReport[] {
  return namespaces
    .filter((item) => item.status === "approved" || item.status === "applied")
    .map((item) => {
      const cpuQuota = parseCpu(item.cpu);
      const memoryQuotaGi = parseMemoryGi(item.memory);
      const last = latestUsage(usage, item.name);
      const cpuUsed = last?.cpuUsed ?? 0;
      const memoryUsedGi = last?.memoryUsedGi ?? 0;
      return {
        namespace: item.name,
        status: item.status,
        cpuQuota,
        memoryQuotaGi,
        cpuUsed,
        memoryUsedGi,
        cpuUtilizationPct: cpuQuota > 0 ? Math.round((cpuUsed / cpuQuota) * 10000) / 100 : 0,
        memoryUtilizationPct: memoryQuotaGi > 0 ? Math.round((memoryUsedGi / memoryQuotaGi) * 10000) / 100 : 0
      };
    });
}

export function toCsv(report: NamespaceUsageReport[]): string {
  const header = "namespace,status,cpuQuota,memoryQuotaGi,cpuUsed,memoryUsedGi,cpuUtilizationPct,memoryUtilizationPct";
  const rows = report.map((row) =>
    [row.namespace, row.status, row.cpuQuota, row.memoryQuotaGi, row.cpuUsed, row.memoryUsedGi, row.cpuUtilizationPct, row.memoryUtilizationPct].join(",")
  );
  return [header, ...rows].join("\n") + "\n";
}
