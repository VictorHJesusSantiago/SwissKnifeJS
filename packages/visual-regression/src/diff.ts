import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { PNG } from "pngjs";
import { thresholdForPixel, validateRegions, type Region } from "./regionTolerance.js";

export interface DiffResult {
  width: number;
  height: number;
  differentPixels: number;
  ignoredPixels: number;
  ratio: number;
  passed: boolean;
}

export async function comparePng(
  baselinePath: string,
  actualPath: string,
  outputPath: string,
  threshold = 0.1,
  maxRatio = 0,
  regions: readonly Region[] = []
): Promise<DiffResult> {
  const [baseline, actual] = await Promise.all([readPng(baselinePath), readPng(actualPath)]);
  const { diff, differentPixels, ignoredPixels } = diffImages(baseline, actual, threshold, regions);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, PNG.sync.write(diff));
  const ratio = differentPixels / (baseline.width * baseline.height);
  return {
    width: baseline.width,
    height: baseline.height,
    differentPixels,
    ignoredPixels,
    ratio: Number(ratio.toFixed(6)),
    passed: ratio <= maxRatio
  };
}

/** Compara dois PNGs já carregados, gerando a imagem de diff e a contagem de pixels alterados. */
export function diffImages(
  baseline: PNG,
  actual: PNG,
  threshold: number,
  regions: readonly Region[] = []
): { diff: PNG; differentPixels: number; ignoredPixels: number } {
  if (baseline.width !== actual.width || baseline.height !== actual.height)
    throw new Error(`Dimensões diferentes: ${baseline.width}x${baseline.height} vs ${actual.width}x${actual.height}`);
  validateRegions(regions);
  const diff = new PNG({ width: baseline.width, height: baseline.height });
  let differentPixels = 0;
  let ignoredPixels = 0;
  const { width } = baseline;
  for (let index = 0; index < baseline.data.length; index += 4) {
    const pixel = index / 4;
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    const effectiveThreshold = thresholdForPixel(x, y, threshold, regions);
    const delta = Math.max(
      Math.abs(baseline.data[index]! - actual.data[index]!),
      Math.abs(baseline.data[index + 1]! - actual.data[index + 1]!),
      Math.abs(baseline.data[index + 2]! - actual.data[index + 2]!),
      Math.abs(baseline.data[index + 3]! - actual.data[index + 3]!)
    ) / 255;
    if (effectiveThreshold === null) {
      ignoredPixels += 1;
      diff.data[index] = baseline.data[index]! * 0.25;
      diff.data[index + 1] = baseline.data[index + 1]! * 0.5 + 30;
      diff.data[index + 2] = baseline.data[index + 2]! * 0.25;
      diff.data[index + 3] = 255;
      continue;
    }
    const changed = delta > effectiveThreshold;
    if (changed) differentPixels += 1;
    diff.data[index] = changed ? 255 : baseline.data[index]! * 0.25;
    diff.data[index + 1] = changed ? 40 : baseline.data[index + 1]! * 0.25;
    diff.data[index + 2] = changed ? 90 : baseline.data[index + 2]! * 0.25;
    diff.data[index + 3] = 255;
  }
  return { diff, differentPixels, ignoredPixels };
}

export async function readPng(path: string): Promise<PNG> {
  return PNG.sync.read(await readFile(path));
}
