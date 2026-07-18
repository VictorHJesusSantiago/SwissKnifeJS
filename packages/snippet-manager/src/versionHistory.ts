import { readJsonFile, writeJsonAtomic } from "../../core/src/io.js";
import type { Snippet } from "./store.js";

export interface SnippetVersion {
  id: string;
  snippetId: string;
  title: string;
  language: string;
  code: string;
  tags: string[];
  category?: string;
  savedAt: string;
}

export interface DiffLine {
  type: "same" | "added" | "removed";
  text: string;
}

/** Keeps a local history of previous snippet revisions, one JSON file per store. */
export class VersionHistoryStore {
  constructor(private readonly file: string) {}

  private list(): Promise<SnippetVersion[]> {
    return readJsonFile(this.file, []);
  }

  async recordPrevious(snippet: Snippet): Promise<void> {
    const all = await this.list();
    const version: SnippetVersion = {
      id: `${snippet.id}:${snippet.updatedAt}`,
      snippetId: snippet.id,
      title: snippet.title,
      language: snippet.language,
      code: snippet.code,
      tags: snippet.tags,
      category: snippet.category,
      savedAt: snippet.updatedAt
    };
    all.unshift(version);
    await writeJsonAtomic(this.file, all);
  }

  async forSnippet(snippetId: string): Promise<SnippetVersion[]> {
    return (await this.list()).filter((version) => version.snippetId === snippetId);
  }

  async get(versionId: string): Promise<SnippetVersion | undefined> {
    return (await this.list()).find((version) => version.id === versionId);
  }

  /** Simple line-based diff (LCS), no external diff library. */
  static diffLines(before: string, after: string): DiffLine[] {
    const a = before.split("\n");
    const b = after.split("\n");
    const n = a.length;
    const m = b.length;
    const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
      }
    }
    const result: DiffLine[] = [];
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (a[i] === b[j]) {
        result.push({ type: "same", text: a[i]! });
        i++; j++;
      } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
        result.push({ type: "removed", text: a[i]! });
        i++;
      } else {
        result.push({ type: "added", text: b[j]! });
        j++;
      }
    }
    while (i < n) { result.push({ type: "removed", text: a[i]! }); i++; }
    while (j < m) { result.push({ type: "added", text: b[j]! }); j++; }
    return result;
  }
}
