export type Args = Record<string, string | boolean | string[]>;

export function parseArgs(argv: string[]): Args {
  const result: Args = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]!;
    if (!token.startsWith("--")) {
      (result._ as string[]).push(token);
      continue;
    }
    const [rawKey, inline] = token.slice(2).split("=", 2);
    if (!rawKey) continue;
    const next = argv[index + 1];
    if (inline !== undefined) result[rawKey] = inline;
    else if (next && !next.startsWith("--")) {
      result[rawKey] = next;
      index += 1;
    } else result[rawKey] = true;
  }
  return result;
}

export function stringArg(args: Args, name: string, fallback?: string): string {
  const value = args[name];
  if (typeof value === "string") return value;
  if (fallback !== undefined) return fallback;
  throw new Error(`Argumento obrigatório ausente: --${name}`);
}

export function numberArg(args: Args, name: string, fallback: number): number {
  const raw = args[name];
  const parsed = typeof raw === "string" ? Number(raw) : fallback;
  if (!Number.isFinite(parsed)) throw new Error(`Valor inválido para --${name}`);
  return parsed;
}
