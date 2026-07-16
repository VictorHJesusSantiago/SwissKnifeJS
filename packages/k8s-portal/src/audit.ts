import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

export interface AuditEntry {
  id: string;
  actor: string;
  action: string;
  target: string;
  details?: unknown;
  timestamp: string;
}

export interface AuditQuery {
  actor?: string;
  action?: string;
  target?: string;
  since?: string;
}

export class AuditLog {
  constructor(private readonly file: string) {}

  async record(entry: Omit<AuditEntry, "id" | "timestamp">): Promise<AuditEntry> {
    const full: AuditEntry = { ...entry, id: randomUUID(), timestamp: new Date().toISOString() };
    await mkdir(dirname(this.file), { recursive: true });
    await appendFile(this.file, `${JSON.stringify(full)}\n`, "utf8");
    return full;
  }

  async query(filter: AuditQuery = {}): Promise<AuditEntry[]> {
    let raw: string;
    try {
      raw = await readFile(this.file, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    const entries = raw.split("\n").filter(Boolean).map((line) => JSON.parse(line) as AuditEntry);
    return entries.filter((entry) =>
      (!filter.actor || entry.actor === filter.actor) &&
      (!filter.action || entry.action === filter.action) &&
      (!filter.target || entry.target === filter.target) &&
      (!filter.since || entry.timestamp >= filter.since)
    );
  }
}
