import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { PNG } from "pngjs";
export interface DiffResult { width: number; height: number; differentPixels: number; ratio: number; passed: boolean }
export async function comparePng(baselinePath: string, actualPath: string, outputPath: string, threshold = 0.1, maxRatio = 0): Promise<DiffResult> {
  const [baseline, actual] = await Promise.all([readPng(baselinePath), readPng(actualPath)]);
  if (baseline.width !== actual.width || baseline.height !== actual.height)
    throw new Error(`Dimensões diferentes: ${baseline.width}x${baseline.height} vs ${actual.width}x${actual.height}`);
  const diff = new PNG({ width: baseline.width, height: baseline.height });
  let differentPixels = 0;
  for (let index = 0; index < baseline.data.length; index += 4) {
    const delta = Math.max(
      Math.abs(baseline.data[index]! - actual.data[index]!),
      Math.abs(baseline.data[index + 1]! - actual.data[index + 1]!),
      Math.abs(baseline.data[index + 2]! - actual.data[index + 2]!),
      Math.abs(baseline.data[index + 3]! - actual.data[index + 3]!)
    ) / 255;
    const changed = delta > threshold;
    if (changed) differentPixels += 1;
    diff.data[index] = changed ? 255 : baseline.data[index]! * 0.25;
    diff.data[index + 1] = changed ? 40 : baseline.data[index + 1]! * 0.25;
    diff.data[index + 2] = changed ? 90 : baseline.data[index + 2]! * 0.25;
    diff.data[index + 3] = 255;
  }
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, PNG.sync.write(diff));
  const ratio = differentPixels / (baseline.width * baseline.height);
  return { width: baseline.width, height: baseline.height, differentPixels, ratio: Number(ratio.toFixed(6)), passed: ratio <= maxRatio };
}
async function readPng(path: string): Promise<PNG> { return PNG.sync.read(await readFile(path)); }
