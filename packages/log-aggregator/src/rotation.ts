import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";

export interface RotationOptions {
  /** tamanho máximo em bytes antes de rotacionar */
  maxSizeBytes?: number;
  /** idade máxima em milissegundos antes de rotacionar */
  maxAgeMs?: number;
  /** diretório onde arquivos rotacionados/compactados são armazenados */
  archiveDir?: string;
  /** quantos arquivos compactados manter (mais antigos são removidos) */
  maxArchives?: number;
}

export interface RotationResult {
  rotated: boolean;
  archivePath?: string;
  removedArchives: string[];
}

const DEFAULTS: Required<Pick<RotationOptions, "maxSizeBytes" | "maxAgeMs" | "maxArchives">> = {
  maxSizeBytes: 10 * 1024 * 1024,
  maxAgeMs: 24 * 60 * 60 * 1000,
  maxArchives: 10
};

/** Verifica critérios de idade/tamanho, rotaciona e compacta com gzip o arquivo de log ativo. */
export async function rotateIfNeeded(file: string, options: RotationOptions = {}): Promise<RotationResult> {
  const maxSizeBytes = options.maxSizeBytes ?? DEFAULTS.maxSizeBytes;
  const maxAgeMs = options.maxAgeMs ?? DEFAULTS.maxAgeMs;
  const maxArchives = options.maxArchives ?? DEFAULTS.maxArchives;
  const archiveDir = options.archiveDir ?? join(dirname(file), "archive");

  let info;
  try {
    info = await stat(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { rotated: false, removedArchives: [] };
    throw error;
  }

  const age = Date.now() - info.mtimeMs;
  const shouldRotate = info.size >= maxSizeBytes || age >= maxAgeMs;
  if (!shouldRotate || info.size === 0) return { rotated: false, removedArchives: [] };

  await mkdir(archiveDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const rotatedPath = join(archiveDir, `${stamp}.ndjson`);
  const archivePath = `${rotatedPath}.gz`;

  await rename(file, rotatedPath);
  await writeFile(file, "", "utf8");

  await pipeline(createReadStream(rotatedPath), createGzip(), createWriteStream(archivePath));
  await rm(rotatedPath, { force: true });

  const removedArchives = await pruneArchives(archiveDir, maxArchives);
  return { rotated: true, archivePath, removedArchives };
}

async function pruneArchives(archiveDir: string, maxArchives: number): Promise<string[]> {
  let entries: string[] = [];
  try {
    entries = (await readdir(archiveDir)).filter((f) => f.endsWith(".gz")).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const excess = entries.length - maxArchives;
  if (excess <= 0) return [];
  const toRemove = entries.slice(0, excess);
  for (const name of toRemove) await rm(join(archiveDir, name), { force: true });
  return toRemove.map((name) => join(archiveDir, name));
}
