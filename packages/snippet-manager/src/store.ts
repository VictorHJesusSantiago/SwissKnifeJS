import { randomUUID } from "node:crypto";
import { readJsonFile, writeJsonAtomic } from "../../core/src/io.js";
export interface Snippet { id: string; title: string; language: string; code: string; tags: string[]; updatedAt: string }
export class SnippetStore {
  constructor(private readonly file: string) {}
  list(): Promise<Snippet[]> { return readJsonFile(this.file, []); }
  async save(input: Omit<Snippet, "id" | "updatedAt"> & { id?: string }): Promise<Snippet> {
    if (!input.title.trim() || !input.code.trim()) throw new Error("Título e código são obrigatórios");
    const all = await this.list();
    const snippet: Snippet = { ...input, id: input.id ?? randomUUID(), updatedAt: new Date().toISOString() };
    const index = all.findIndex((item) => item.id === snippet.id);
    if (index >= 0) all[index] = snippet; else all.unshift(snippet);
    await writeJsonAtomic(this.file, all);
    return snippet;
  }
  async remove(id: string): Promise<void> { await writeJsonAtomic(this.file, (await this.list()).filter((item) => item.id !== id)); }
}
