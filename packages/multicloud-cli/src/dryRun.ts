import type { Args } from "../../core/src/args.js";

export interface DryRunPreview {
  action: string;
  details?: Record<string, unknown>;
}

export type DryRunResult<T> = { dryRun: true; action: string; details?: Record<string, unknown> } | T;

/** A flag "--dry-run" é lida pelo parseArgs existente sem conversão de camelCase. */
export function isDryRun(args: Args): boolean {
  return args["dry-run"] === true;
}

/**
 * Modo dry-run universal: se --dry-run estiver presente, apenas retorna o preview
 * da ação sem executá-la. Não imprime nada — quem chama decide como exibir o
 * resultado (dry-run ou real), evitando saída duplicada.
 */
export async function runWithDryRun<T>(args: Args, preview: DryRunPreview, action: () => Promise<T>): Promise<DryRunResult<T>> {
  if (isDryRun(args)) return { dryRun: true, action: preview.action, details: preview.details };
  return action();
}
