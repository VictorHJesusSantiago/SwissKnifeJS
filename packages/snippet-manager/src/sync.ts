import { readJsonFile, writeJsonAtomic } from "../../core/src/io.js";
import type { Snippet } from "./store.js";

interface SyncFile {
  snippets: Snippet[];
}

/**
 * Synchronizes the local snippet list with a shared file (local folder or network share
 * path chosen by the user). Merge strategy: newest `updatedAt` wins per snippet id,
 * union of ids from both sides, no cloud dependency.
 */
export class SyncManager {
  constructor(private syncFilePath: string | undefined) {}

  setPath(path: string | undefined): void {
    this.syncFilePath = path;
  }

  getPath(): string | undefined {
    return this.syncFilePath;
  }

  private async readSyncFile(): Promise<Snippet[]> {
    if (!this.syncFilePath) return [];
    const data = await readJsonFile<SyncFile>(this.syncFilePath, { snippets: [] });
    return data.snippets ?? [];
  }

  static merge(local: Snippet[], remote: Snippet[]): Snippet[] {
    const byId = new Map<string, Snippet>();
    for (const snippet of local) byId.set(snippet.id, snippet);
    for (const snippet of remote) {
      const existing = byId.get(snippet.id);
      if (!existing || new Date(snippet.updatedAt).getTime() > new Date(existing.updatedAt).getTime()) {
        byId.set(snippet.id, snippet);
      }
    }
    return [...byId.values()].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  /** Merges local snippets with whatever is currently in the shared file and writes the union back. */
  async syncNow(local: Snippet[]): Promise<Snippet[]> {
    if (!this.syncFilePath) return local;
    const remote = await this.readSyncFile();
    const merged = SyncManager.merge(local, remote);
    await writeJsonAtomic(this.syncFilePath, { snippets: merged } satisfies SyncFile);
    return merged;
  }
}
