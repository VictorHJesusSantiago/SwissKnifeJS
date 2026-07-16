import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

export interface SavedQuery {
  id: string;
  name: string;
  query: string;
  createdAt: string;
}

/** Armazena filtros de busca nomeados e reutilizáveis (query DSL) em um arquivo JSON local. */
export class SavedQueryStore {
  constructor(private readonly file: string) {}

  private async readAll(): Promise<SavedQuery[]> {
    try {
      return JSON.parse(await readFile(this.file, "utf8")) as SavedQuery[];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      return [];
    }
  }

  private async writeAll(queries: SavedQuery[]): Promise<void> {
    await mkdir(dirname(this.file), { recursive: true });
    await writeFile(this.file, JSON.stringify(queries, null, 2), "utf8");
  }

  async save(input: { name: string; query: string }): Promise<SavedQuery> {
    if (!input.name || !input.query) throw new Error("name e query são obrigatórios");
    const all = await this.readAll();
    const existingIndex = all.findIndex((q) => q.name === input.name);
    const saved: SavedQuery = {
      id: existingIndex >= 0 ? all[existingIndex]!.id : randomUUID(),
      name: input.name,
      query: input.query,
      createdAt: existingIndex >= 0 ? all[existingIndex]!.createdAt : new Date().toISOString()
    };
    if (existingIndex >= 0) all[existingIndex] = saved;
    else all.push(saved);
    await this.writeAll(all);
    return saved;
  }

  async list(): Promise<SavedQuery[]> {
    return this.readAll();
  }

  async get(name: string): Promise<SavedQuery | undefined> {
    return (await this.readAll()).find((q) => q.name === name);
  }

  async remove(id: string): Promise<boolean> {
    const all = await this.readAll();
    const filtered = all.filter((q) => q.id !== id);
    if (filtered.length === all.length) return false;
    await this.writeAll(filtered);
    return true;
  }
}
