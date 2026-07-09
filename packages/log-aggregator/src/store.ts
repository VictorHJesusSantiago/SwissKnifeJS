import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
export type Level = "debug" | "info" | "warn" | "error";
export interface LogEntry {
  id: string; timestamp: string; level: Level; service: string; message: string;
  traceId?: string; metadata?: Record<string, unknown>;
}
export class LogStore {
  constructor(private readonly file: string) {}
  async ingest(input: Omit<LogEntry, "id" | "timestamp"> & { timestamp?: string }): Promise<LogEntry> {
    if (!["debug", "info", "warn", "error"].includes(input.level)) throw new Error("level inválido");
    if (!input.service || !input.message) throw new Error("service e message são obrigatórios");
    const entry: LogEntry = { ...input, id: randomUUID(), timestamp: input.timestamp ?? new Date().toISOString() };
    await mkdir(dirname(this.file), { recursive: true });
    await appendFile(this.file, `${JSON.stringify(entry)}\n`, "utf8");
    return entry;
  }
  async query(filters: { service?: string; level?: string; search?: string; traceId?: string; limit?: number }): Promise<LogEntry[]> {
    let text = "";
    try { text = await readFile(this.file, "utf8"); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    return text.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as LogEntry)
      .filter((e) => !filters.service || e.service === filters.service)
      .filter((e) => !filters.level || e.level === filters.level)
      .filter((e) => !filters.traceId || e.traceId === filters.traceId)
      .filter((e) => !filters.search || e.message.toLowerCase().includes(filters.search.toLowerCase()))
      .slice(-(filters.limit ?? 100)).reverse();
  }
}
