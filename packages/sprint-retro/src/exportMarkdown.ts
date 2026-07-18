import type { ActionItem } from "./actionItems.js";
import type { SprintData } from "./providers.js";
import { retrospective } from "./report.js";
import type { CategorizedNote, RetroTemplate } from "./retroTemplates.js";
import type { ComparisonResult } from "./sprintComparison.js";

export interface RetroDocument {
  data: SprintData;
  actionItems?: ActionItem[];
  comparison?: ComparisonResult;
  template?: RetroTemplate;
  categorized?: CategorizedNote[];
}

function trendArrow(trend: "up" | "down" | "flat"): string {
  return trend === "up" ? "▲" : trend === "down" ? "▼" : "▬";
}

/** Gera a retrospectiva completa em Markdown, incluindo template, comparação e action items. */
export function exportMarkdown(doc: RetroDocument): string {
  const parts = [retrospective(doc.data).trimEnd()];

  if (doc.template) {
    parts.push("", `## ${doc.template.label}`, "");
    for (const category of doc.template.categories) {
      parts.push(`### ${category}`, "");
      const items = (doc.categorized ?? []).filter((note) => note.category === category);
      parts.push(...(items.length ? items.map((item) => `- ${item.text}`) : ["- (nenhuma nota)"]), "");
    }
  }

  if (doc.comparison && doc.comparison.deltas.length) {
    parts.push("## Comparação com sprint anterior", "", `Sprint anterior: ${doc.comparison.previous?.name}`, "");
    for (const delta of doc.comparison.deltas) {
      const pct = delta.deltaPct === null ? "n/d" : `${delta.deltaPct >= 0 ? "+" : ""}${delta.deltaPct.toFixed(1)}%`;
      parts.push(`- ${delta.metric}: ${delta.current} (era ${delta.previous}, ${pct} ${trendArrow(delta.trend)})`);
    }
    parts.push("");
  }

  if (doc.actionItems && doc.actionItems.length) {
    parts.push("## Action Items", "");
    for (const item of doc.actionItems) parts.push(`- [ ] ${item.text}${item.assignee ? ` (@${item.assignee})` : ""}`);
    parts.push("");
  }

  return `${parts.join("\n")}\n`;
}
