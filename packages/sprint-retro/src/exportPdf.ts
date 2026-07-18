/**
 * Gerador de PDF minimalista, 100% offline e sem dependências externas.
 * Produz um PDF texto simples (fonte Helvetica, uma coluna, múltiplas páginas)
 * suficiente para exportar a retrospectiva sem depender de nenhum serviço/rede.
 */

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN_LEFT = 50;
const MARGIN_TOP = 760;
const MARGIN_BOTTOM = 50;
const FONT_SIZE = 11;
const LINE_HEIGHT = 15;
const MAX_CHARS_PER_LINE = 95;

function escapePdfText(text: string): string {
  // eslint-disable-next-line no-control-regex
  const ascii = text.replace(/[^\x20-\x7E]/g, (char) => (char === "•" ? "-" : "?"));
  return ascii.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrapLine(line: string, maxChars: number): string[] {
  if (line.length <= maxChars) return [line];
  const words = line.split(" ");
  const wrapped: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars && current) {
      wrapped.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) wrapped.push(current);
  return wrapped;
}

/** Converte texto Markdown em linhas simples de texto plano, adequadas para o PDF. */
export function markdownToPlainLines(markdown: string): string[] {
  return markdown
    .split("\n")
    .map((line) =>
      line
        .replace(/^#{1,6}\s*/, "")
        .replace(/^-\s*\[ \]\s*/, "- [ ] ")
        .replace(/\*\*(.*?)\*\*/g, "$1")
        .replace(/`(.*?)`/g, "$1")
    );
}

/** Gera um Buffer contendo um documento PDF válido a partir de linhas de texto. */
export function textToPdf(lines: string[]): Buffer {
  const wrapped = lines.flatMap((line) => (line.length ? wrapLine(line, MAX_CHARS_PER_LINE) : [""]));
  const linesPerPage = Math.max(1, Math.floor((MARGIN_TOP - MARGIN_BOTTOM) / LINE_HEIGHT));
  const pages: string[][] = [];
  for (let index = 0; index < wrapped.length; index += linesPerPage) pages.push(wrapped.slice(index, index + linesPerPage));
  if (pages.length === 0) pages.push([]);

  const catalogId = 1;
  const pagesId = 2;
  const fontId = 3;
  let nextId = 4;
  const pageIds = pages.map(() => nextId++);
  const contentIds = pages.map(() => nextId++);

  const objects: string[] = [];
  objects[catalogId] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  objects[fontId] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`;

  pages.forEach((pageLines, index) => {
    const pageId = pageIds[index]!;
    const contentId = contentIds[index]!;
    objects[pageId] =
      `<< /Type /Page /Parent ${pagesId} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> ` +
      `/MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Contents ${contentId} 0 R >>`;

    const streamBody = pageLines
      .map((line, lineIndex) => {
        const y = MARGIN_TOP - lineIndex * LINE_HEIGHT;
        return `BT /F1 ${FONT_SIZE} Tf ${MARGIN_LEFT} ${y} Td (${escapePdfText(line)}) Tj ET`;
      })
      .join("\n");
    objects[contentId] = `<< /Length ${Buffer.byteLength(streamBody, "utf8")} >>\nstream\n${streamBody}\nendstream`;
  });

  const totalObjects = nextId - 1;
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = new Array(totalObjects + 1).fill(0);

  for (let id = 1; id <= totalObjects; id += 1) {
    offsets[id] = Buffer.byteLength(pdf, "utf8");
    pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${totalObjects + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let id = 1; id <= totalObjects; id += 1) {
    pdf += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${totalObjects + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(pdf, "utf8");
}
