import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { DiffResult } from "./diff.js";

export interface ReportEntry {
  name: string;
  baselinePath: string;
  actualPath: string;
  diffPath: string;
  result: DiffResult;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]!));
}

async function toBase64(path: string): Promise<string> {
  const buffer = await readFile(path);
  return buffer.toString("base64");
}

/** Gera um relatório HTML autocontido (imagens embutidas em base64, sem servidor). */
export async function generateHtmlReport(entries: readonly ReportEntry[]): Promise<string> {
  const sections = await Promise.all(
    entries.map(async (entry) => {
      const [baseline, actual, diff] = await Promise.all([
        toBase64(entry.baselinePath),
        toBase64(entry.actualPath),
        toBase64(entry.diffPath)
      ]);
      const status = entry.result.passed ? "OK" : "FALHOU";
      return `
    <section class="entry ${entry.result.passed ? "pass" : "fail"}">
      <h2>${escapeHtml(entry.name)} <span class="badge">${status}</span></h2>
      <p class="meta">Dimensões: ${entry.result.width}x${entry.result.height} · Pixels diferentes: ${entry.result.differentPixels} · Proporção: ${entry.result.ratio}</p>
      <div class="images">
        <figure><figcaption>Baseline</figcaption><img src="data:image/png;base64,${baseline}" alt="baseline"/></figure>
        <figure><figcaption>Atual</figcaption><img src="data:image/png;base64,${actual}" alt="atual"/></figure>
        <figure><figcaption>Diff (overlay)</figcaption><img src="data:image/png;base64,${diff}" alt="diff"/></figure>
      </div>
    </section>`;
    })
  );
  return `<!doctype html>
<html lang="pt-br">
<head>
<meta charset="utf-8"/>
<title>Relatório de Regressão Visual</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 2rem; background: #111; color: #eee; }
  h1 { margin-bottom: 1.5rem; }
  .entry { border: 1px solid #444; border-radius: 8px; padding: 1rem; margin-bottom: 1.5rem; }
  .entry.pass { border-color: #2e7d32; }
  .entry.fail { border-color: #c62828; }
  .badge { font-size: 0.75rem; padding: 0.15rem 0.5rem; border-radius: 4px; background: #333; }
  .entry.pass .badge { background: #2e7d32; }
  .entry.fail .badge { background: #c62828; }
  .meta { color: #aaa; font-size: 0.9rem; }
  .images { display: flex; gap: 1rem; flex-wrap: wrap; }
  .images figure { margin: 0; }
  .images img { max-width: 320px; border: 1px solid #333; display: block; }
  .images figcaption { font-size: 0.8rem; color: #999; margin-bottom: 0.25rem; }
</style>
</head>
<body>
<h1>Relatório de Regressão Visual</h1>
${sections.join("\n")}
</body>
</html>`;
}

export async function writeHtmlReport(outputPath: string, entries: readonly ReportEntry[]): Promise<void> {
  const html = await generateHtmlReport(entries);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, html, "utf8");
}
