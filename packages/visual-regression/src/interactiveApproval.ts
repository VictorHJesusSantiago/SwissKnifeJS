import { copyFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import type { DiffResult } from "./diff.js";

export interface PendingDiff {
  name: string;
  baselinePath: string;
  actualPath: string;
  diffPath: string;
  result: DiffResult;
}

export interface ApprovalOutcome {
  name: string;
  approved: boolean;
}

const AFFIRMATIVE = new Set(["y", "yes", "s", "sim"]);

/**
 * CLI interativa: mostra cada diff pendente (referenciando o path do arquivo
 * de diff gerado) e pergunta se a nova imagem deve ser aceita como baseline.
 * Em caso afirmativo, copia o arquivo `actual` por cima do `baseline`.
 */
export async function runInteractiveApproval(
  pending: readonly PendingDiff[],
  input: NodeJS.ReadableStream = process.stdin,
  output: NodeJS.WritableStream = process.stdout
): Promise<ApprovalOutcome[]> {
  const rl = createInterface({ input, output });
  const outcomes: ApprovalOutcome[] = [];
  try {
    for (const item of pending) {
      output.write(`\n[${item.name}]\n`);
      output.write(`  diff:     ${item.diffPath}\n`);
      output.write(`  baseline: ${item.baselinePath}\n`);
      output.write(`  atual:    ${item.actualPath}\n`);
      output.write(`  pixels diferentes: ${item.result.differentPixels} (proporção ${item.result.ratio})\n`);
      const answer = (await rl.question("Aceitar nova imagem como baseline? [y/N] ")).trim().toLowerCase();
      const approved = AFFIRMATIVE.has(answer);
      if (approved) await copyFile(item.actualPath, item.baselinePath);
      outcomes.push({ name: item.name, approved });
    }
  } finally {
    rl.close();
  }
  return outcomes;
}
