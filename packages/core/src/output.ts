const ESC = String.fromCharCode(27);
const COLORS = {
  reset: ESC + "[0m",
  bold: ESC + "[1m",
  dim: ESC + "[2m",
  red: ESC + "[31m",
  green: ESC + "[32m",
  yellow: ESC + "[33m",
  blue: ESC + "[34m",
  cyan: ESC + "[36m"
} as const;

export type Color = keyof typeof COLORS;

const colorEnabled = process.stdout?.isTTY && process.env.NO_COLOR === undefined;

export function color(text: string, name: Color): string {
  if (!colorEnabled) return text;
  return `${COLORS[name]}${text}${COLORS.reset}`;
}

export function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export interface TableColumn {
  key: string;
  header: string;
  align?: "left" | "right";
}

export function formatTable(rows: Array<Record<string, unknown>>, columns?: TableColumn[]): string {
  const cols: TableColumn[] = columns ?? Object.keys(rows[0] ?? {}).map((key) => ({ key, header: key }));
  const widths = cols.map((col) =>
    Math.max(col.header.length, ...rows.map((row) => String(row[col.key] ?? "").length))
  );
  const renderRow = (cells: string[]): string =>
    cells
      .map((cell, index) => {
        const width = widths[index]!;
        const col = cols[index]!;
        return col.align === "right" ? cell.padStart(width) : cell.padEnd(width);
      })
      .join("  ");
  const header = color(renderRow(cols.map((col) => col.header)), "bold");
  const separator = widths.map((width) => "-".repeat(width)).join("  ");
  const body = rows.map((row) => renderRow(cols.map((col) => String(row[col.key] ?? ""))));
  return [header, separator, ...body].join("\n");
}

export function printTable(rows: Array<Record<string, unknown>>, columns?: TableColumn[]): void {
  process.stdout.write(`${formatTable(rows, columns)}\n`);
}

export type OutputFormat = "table" | "json";

export function printOutput(rows: Array<Record<string, unknown>>, format: OutputFormat, columns?: TableColumn[]): void {
  if (format === "json") printJson(rows);
  else printTable(rows, columns);
}
