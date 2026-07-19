import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { CheckResult } from "./monitor.js";

export async function appendHistory(path: string, results: CheckResult[]): Promise<void> {
  if (!results.length) return;
  await mkdir(dirname(path), { recursive: true });
  const lines = results.map((result) => JSON.stringify(result)).join("\n");
  await appendFile(path, `${lines}\n`, "utf8");
}

export async function readHistory(path: string): Promise<CheckResult[]> {
  try {
    const content = await readFile(path, "utf8");
    return content
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as CheckResult);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}
