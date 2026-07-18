import type { Snippet } from "./store.js";

export interface SearchOptions {
  query?: string;
  tags?: string[];
  category?: string;
}

/** Simple in-memory full-text index over title/code/tags/category. No external search lib. */
export class SearchIndex {
  private snippets: Snippet[] = [];

  reindex(snippets: Snippet[]): void {
    this.snippets = snippets;
  }

  private tokenize(text: string): string[] {
    return text.toLowerCase().split(/[^a-z0-9áéíóúâêîôûãõçü]+/i).filter(Boolean);
  }

  private matchesQuery(snippet: Snippet, query: string): boolean {
    const terms = this.tokenize(query);
    if (terms.length === 0) return true;
    const haystack = this.tokenize([snippet.title, snippet.code, snippet.tags.join(" "), snippet.category ?? ""].join(" "));
    const haystackSet = new Set(haystack);
    return terms.every((term) => [...haystackSet].some((word) => word.includes(term)));
  }

  search(options: SearchOptions): Snippet[] {
    return this.snippets.filter((snippet) => {
      if (options.query && !this.matchesQuery(snippet, options.query)) return false;
      if (options.tags && options.tags.length > 0 && !options.tags.every((tag) => snippet.tags.includes(tag))) return false;
      if (options.category && snippet.category !== options.category) return false;
      return true;
    });
  }

  allTags(): string[] {
    return [...new Set(this.snippets.flatMap((snippet) => snippet.tags))].sort();
  }

  allCategories(): string[] {
    return [...new Set(this.snippets.map((snippet) => snippet.category).filter((value): value is string => Boolean(value)))].sort();
  }
}
