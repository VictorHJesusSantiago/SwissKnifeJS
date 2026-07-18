import { readFile, writeFile } from "node:fs/promises";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type { Snippet } from "./store.js";

export type ExportFormat = "json" | "yaml";

interface ExportedSnippet {
  title: string;
  language: string;
  code: string;
  tags: string[];
  category?: string;
}

function toExportShape(snippets: Snippet[]): ExportedSnippet[] {
  return snippets.map(({ title, language, code, tags, category }) => ({ title, language, code, tags, category }));
}

export async function exportSnippets(filePath: string, snippets: Snippet[], format: ExportFormat): Promise<void> {
  const payload = toExportShape(snippets);
  const content = format === "yaml" ? stringifyYaml(payload) : `${JSON.stringify(payload, null, 2)}\n`;
  await writeFile(filePath, content, "utf8");
}

function normalizeImported(raw: unknown): ExportedSnippet[] {
  const list = Array.isArray(raw) ? raw : (raw as { snippets?: unknown[] })?.snippets ?? [];
  return (list as Record<string, unknown>[])
    .filter((item) => item && typeof item === "object")
    .map((item) => ({
      title: String(item.title ?? item.name ?? "Sem título"),
      language: String(item.language ?? item.lang ?? "text"),
      code: String(item.code ?? item.content ?? item.body ?? ""),
      tags: Array.isArray(item.tags) ? item.tags.map(String) : typeof item.tags === "string" ? item.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
      category: item.category ? String(item.category) : undefined
    }));
}

export async function importSnippets(filePath: string): Promise<ExportedSnippet[]> {
  const content = await readFile(filePath, "utf8");
  const isYaml = /\.ya?ml$/i.test(filePath) || (!/\.json$/i.test(filePath) && !content.trim().startsWith("{") && !content.trim().startsWith("["));
  const raw = isYaml ? parseYaml(content) : JSON.parse(content);
  return normalizeImported(raw);
}
