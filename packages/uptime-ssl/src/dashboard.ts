import type { CheckResult } from "./monitor.js";

interface TargetSummary {
  name: string;
  url: string;
  uptimePercent: number;
  checks: CheckResult[];
}

function groupByTarget(history: CheckResult[]): TargetSummary[] {
  const map = new Map<string, CheckResult[]>();
  for (const result of history) {
    const list = map.get(result.name) ?? [];
    list.push(result);
    map.set(result.name, list);
  }
  return [...map.entries()].map(([name, checks]) => {
    const ok = checks.filter((check) => check.ok).length;
    return {
      name,
      url: checks[checks.length - 1]?.url ?? "",
      uptimePercent: checks.length ? (ok / checks.length) * 100 : 0,
      checks
    };
  });
}

function sparkline(checks: CheckResult[], width = 640, height = 60): string {
  const recent = checks.slice(-120);
  if (!recent.length) return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"></svg>`;
  const barWidth = width / recent.length;
  const bars = recent.map((check, index) => {
    const x = (index * barWidth).toFixed(2);
    const color = check.ok ? "#22c55e" : "#ef4444";
    const title = `${check.checkedAt}: ${check.ok ? "OK" : check.error ?? `HTTP ${check.status}`}`;
    return `<rect x="${x}" y="0" width="${Math.max(barWidth - 1, 1).toFixed(2)}" height="${height}" fill="${color}"><title>${escapeHtml(title)}</title></rect>`;
  }).join("");
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">${bars}</svg>`;
}

function escapeHtml(value: string): string {
  const map: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return value.replace(/[&<>"']/g, (char) => map[char] ?? char);
}

export function generateDashboard(history: CheckResult[]): string {
  const summaries = groupByTarget(history);
  const sections = summaries.map((summary) => `
    <section class="target">
      <h2>${escapeHtml(summary.name)}</h2>
      <p class="url">${escapeHtml(summary.url)}</p>
      <p class="uptime">Uptime: ${summary.uptimePercent.toFixed(2)}% &middot; ${summary.checks.length} checagens</p>
      ${sparkline(summary.checks)}
    </section>`).join("\n");
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>uptime-ssl dashboard</title>
<style>
  :root { color-scheme: dark; }
  body { font-family: system-ui, -apple-system, sans-serif; background: #0f172a; color: #e2e8f0; margin: 0; padding: 2rem; }
  h1 { margin-top: 0; }
  .generated { color: #94a3b8; margin-bottom: 2rem; }
  .target { background: #1e293b; border-radius: 8px; padding: 1rem 1.5rem; margin-bottom: 1.5rem; }
  .target h2 { margin: 0 0 0.25rem; }
  .url { color: #94a3b8; margin: 0 0 0.5rem; font-size: 0.9rem; }
  .uptime { font-weight: 600; margin-bottom: 0.75rem; }
  svg { display: block; width: 100%; height: 60px; border-radius: 4px; overflow: hidden; }
</style>
</head>
<body>
<h1>uptime-ssl dashboard</h1>
<p class="generated">Gerado em ${new Date().toISOString()}</p>
${sections || "<p>Sem histórico disponível.</p>"}
</body>
</html>
`;
}
