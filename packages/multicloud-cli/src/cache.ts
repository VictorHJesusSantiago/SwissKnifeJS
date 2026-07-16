import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export type CacheFile = Record<string, CacheEntry<unknown>>;

export interface CacheOptions {
  path: string;
  ttlMs?: number;
}

const DEFAULT_TTL_MS = 5 * 60 * 1000;

export function defaultCachePath(): string {
  return fileURLToPath(new URL("../.cache/multicloud-cache.json", import.meta.url));
}

async function readCacheFile(path: string): Promise<CacheFile> {
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw) as CacheFile;
  } catch {
    return {};
  }
}

async function writeCacheFile(path: string, data: CacheFile): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2), "utf8");
}

export async function getCached<T>(key: string, options: CacheOptions): Promise<T | undefined> {
  const file = await readCacheFile(options.path);
  const entry = file[key];
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) return undefined;
  return entry.value as T;
}

export async function setCached<T>(key: string, value: T, options: CacheOptions): Promise<void> {
  const file = await readCacheFile(options.path);
  file[key] = { value, expiresAt: Date.now() + (options.ttlMs ?? DEFAULT_TTL_MS) };
  await writeCacheFile(options.path, file);
}

export async function clearCache(path: string): Promise<void> {
  await writeCacheFile(path, {});
}

/** Executa `compute` só se não houver entrada válida em cache; grava o resultado com TTL. */
export async function withCache<T>(
  key: string,
  options: CacheOptions,
  compute: () => Promise<T>
): Promise<{ value: T; fromCache: boolean }> {
  const cached = await getCached<T>(key, options);
  if (cached !== undefined) return { value: cached, fromCache: true };
  const value = await compute();
  await setCached(key, value, options);
  return { value, fromCache: false };
}
