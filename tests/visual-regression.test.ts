import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PNG } from "pngjs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { comparePng, diffImages, readPng } from "../packages/visual-regression/src/diff.js";
import { isInRegion, thresholdForPixel, type Region } from "../packages/visual-regression/src/regionTolerance.js";
import { pathForViewport, parseViewports } from "../packages/visual-regression/src/viewports.js";
import { generateHtmlReport } from "../packages/visual-regression/src/htmlReport.js";
import { runInteractiveApproval, type PendingDiff } from "../packages/visual-regression/src/interactiveApproval.js";
import { Readable, Writable } from "node:stream";

function makePng(width: number, height: number, fill: (x: number, y: number) => [number, number, number, number]): PNG {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (width * y + x) << 2;
      const [r, g, b, a] = fill(x, y);
      png.data[index] = r;
      png.data[index + 1] = g;
      png.data[index + 2] = b;
      png.data[index + 3] = a;
    }
  }
  return png;
}

describe("regionTolerance", () => {
  const region: Region = { x: 2, y: 2, width: 3, height: 3, ignore: true };

  it("detecta pixels dentro/fora de uma região", () => {
    expect(isInRegion(2, 2, region)).toBe(true);
    expect(isInRegion(4, 4, region)).toBe(true);
    expect(isInRegion(5, 5, region)).toBe(false);
    expect(isInRegion(0, 0, region)).toBe(false);
  });

  it("retorna null para pixels em região ignorada", () => {
    expect(thresholdForPixel(3, 3, 0.1, [region])).toBeNull();
    expect(thresholdForPixel(0, 0, 0.1, [region])).toBe(0.1);
  });

  it("usa threshold customizado da região quando não ignorada", () => {
    const custom: Region = { x: 0, y: 0, width: 10, height: 10, threshold: 0.5 };
    expect(thresholdForPixel(1, 1, 0.1, [custom])).toBe(0.5);
  });
});

describe("viewports", () => {
  it("interpreta especificação de múltiplos viewports", () => {
    expect(parseViewports("desktop:1440x900,mobile:375x667")).toEqual([
      { name: "desktop", width: 1440, height: 900 },
      { name: "mobile", width: 375, height: 667 }
    ]);
  });

  it("rejeita especificação inválida", () => {
    expect(() => parseViewports("desktop")).toThrow();
    expect(() => parseViewports("desktop:abcxdef")).toThrow();
  });

  it("deriva caminho por viewport", () => {
    const path = pathForViewport("baselines/home.png", { name: "mobile", width: 375, height: 667 });
    expect(path.replace(/\\/g, "/")).toBe("baselines/mobile/home.png");
  });
});

describe("diffImages", () => {
  it("marca pixels diferentes acima do threshold", () => {
    const baseline = makePng(4, 4, () => [10, 10, 10, 255]);
    const actual = makePng(4, 4, (x, y) => (x === 0 && y === 0 ? [255, 10, 10, 255] : [10, 10, 10, 255]));
    const { differentPixels, ignoredPixels } = diffImages(baseline, actual, 0.1);
    expect(differentPixels).toBe(1);
    expect(ignoredPixels).toBe(0);
  });

  it("ignora diferenças dentro de uma região marcada como ignore", () => {
    const baseline = makePng(4, 4, () => [10, 10, 10, 255]);
    const actual = makePng(4, 4, (x, y) => (x === 0 && y === 0 ? [255, 10, 10, 255] : [10, 10, 10, 255]));
    const region: Region = { x: 0, y: 0, width: 2, height: 2, ignore: true };
    const { differentPixels, ignoredPixels } = diffImages(baseline, actual, 0.1, [region]);
    expect(differentPixels).toBe(0);
    expect(ignoredPixels).toBeGreaterThan(0);
  });

  it("aplica threshold mais permissivo em uma região específica", () => {
    const baseline = makePng(4, 4, () => [10, 10, 10, 255]);
    // diferença pequena (delta ~ 20/255 ~ 0.078) dentro da região tolerante
    const actual = makePng(4, 4, (x, y) => (x === 0 && y === 0 ? [30, 10, 10, 255] : [10, 10, 10, 255]));
    const strictRegion: Region = { x: 0, y: 0, width: 2, height: 2, threshold: 0.01 };
    const lenientRegion: Region = { x: 0, y: 0, width: 2, height: 2, threshold: 0.5 };
    expect(diffImages(baseline, actual, 0.1, [strictRegion]).differentPixels).toBe(1);
    expect(diffImages(baseline, actual, 0.1, [lenientRegion]).differentPixels).toBe(0);
  });

  it("lança erro para dimensões diferentes", () => {
    const baseline = makePng(4, 4, () => [0, 0, 0, 255]);
    const actual = makePng(2, 2, () => [0, 0, 0, 255]);
    expect(() => diffImages(baseline, actual, 0.1)).toThrow();
  });
});

describe("comparePng (integração via arquivos)", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "visual-regression-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("compara dois PNGs em disco e grava a imagem de diff", async () => {
    const baselinePath = join(dir, "baseline.png");
    const actualPath = join(dir, "actual.png");
    const diffPath = join(dir, "diff.png");
    await writeFile(baselinePath, PNG.sync.write(makePng(4, 4, () => [10, 10, 10, 255])));
    await writeFile(actualPath, PNG.sync.write(makePng(4, 4, (x, y) => (x === 0 && y === 0 ? [255, 0, 0, 255] : [10, 10, 10, 255]))));

    const result = await comparePng(baselinePath, actualPath, diffPath, 0.1, 0);
    expect(result.differentPixels).toBe(1);
    expect(result.passed).toBe(false);

    const diffOnDisk = await readPng(diffPath);
    expect(diffOnDisk.width).toBe(4);
    expect(diffOnDisk.height).toBe(4);
  });

  it("passa quando maxRatio comporta a diferença", async () => {
    const baselinePath = join(dir, "baseline.png");
    const actualPath = join(dir, "actual.png");
    const diffPath = join(dir, "diff.png");
    await writeFile(baselinePath, PNG.sync.write(makePng(4, 4, () => [10, 10, 10, 255])));
    await writeFile(actualPath, PNG.sync.write(makePng(4, 4, (x, y) => (x === 0 && y === 0 ? [255, 0, 0, 255] : [10, 10, 10, 255]))));

    const result = await comparePng(baselinePath, actualPath, diffPath, 0.1, 1);
    expect(result.passed).toBe(true);
  });

  it("ignora região dinâmica configurada via regions.json equivalente", async () => {
    const baselinePath = join(dir, "baseline.png");
    const actualPath = join(dir, "actual.png");
    const diffPath = join(dir, "diff.png");
    await writeFile(baselinePath, PNG.sync.write(makePng(4, 4, () => [10, 10, 10, 255])));
    await writeFile(actualPath, PNG.sync.write(makePng(4, 4, (x, y) => (x === 0 && y === 0 ? [255, 0, 0, 255] : [10, 10, 10, 255]))));

    const region: Region = { x: 0, y: 0, width: 2, height: 2, ignore: true };
    const result = await comparePng(baselinePath, actualPath, diffPath, 0.1, 0, [region]);
    expect(result.differentPixels).toBe(0);
    expect(result.passed).toBe(true);
  });
});

describe("htmlReport", () => {
  it("gera HTML autocontido com imagens em base64", async () => {
    const dir = await mkdtemp(join(tmpdir(), "visual-report-"));
    try {
      const baselinePath = join(dir, "baseline.png");
      const actualPath = join(dir, "actual.png");
      const diffPath = join(dir, "diff.png");
      const png = makePng(2, 2, () => [1, 2, 3, 255]);
      await writeFile(baselinePath, PNG.sync.write(png));
      await writeFile(actualPath, PNG.sync.write(png));
      await writeFile(diffPath, PNG.sync.write(png));

      const html = await generateHtmlReport([
        {
          name: "home",
          baselinePath,
          actualPath,
          diffPath,
          result: { width: 2, height: 2, differentPixels: 0, ignoredPixels: 0, ratio: 0, passed: true }
        }
      ]);
      expect(html).toContain("<!doctype html>");
      expect(html).toContain("home");
      expect(html).toContain("data:image/png;base64,");
      expect(html).toContain("OK");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("interactiveApproval", () => {
  it("copia a imagem atual sobre a baseline quando aprovado", async () => {
    const dir = await mkdtemp(join(tmpdir(), "visual-approve-"));
    try {
      const baselinePath = join(dir, "baseline.png");
      const actualPath = join(dir, "actual.png");
      const diffPath = join(dir, "diff.png");
      await writeFile(baselinePath, PNG.sync.write(makePng(2, 2, () => [0, 0, 0, 255])));
      await writeFile(actualPath, PNG.sync.write(makePng(2, 2, () => [255, 255, 255, 255])));
      await writeFile(diffPath, PNG.sync.write(makePng(2, 2, () => [0, 0, 0, 255])));

      const pending: PendingDiff[] = [
        {
          name: "home",
          baselinePath,
          actualPath,
          diffPath,
          result: { width: 2, height: 2, differentPixels: 4, ignoredPixels: 0, ratio: 1, passed: false }
        }
      ];

      const input = Readable.from(["y\n"]);
      let written = "";
      const output = new Writable({
        write(chunk, _enc, callback) {
          written += chunk.toString();
          callback();
        }
      });

      const outcomes = await runInteractiveApproval(pending, input, output);
      expect(outcomes).toEqual([{ name: "home", approved: true }]);
      expect(written).toContain(diffPath);

      const baselineAfter = await readFile(baselinePath);
      const actualBuffer = await readFile(actualPath);
      expect(baselineAfter.equals(actualBuffer)).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("não altera a baseline quando rejeitado", async () => {
    const dir = await mkdtemp(join(tmpdir(), "visual-reject-"));
    try {
      const baselinePath = join(dir, "baseline.png");
      const actualPath = join(dir, "actual.png");
      const diffPath = join(dir, "diff.png");
      const baselineBuf = PNG.sync.write(makePng(2, 2, () => [0, 0, 0, 255]));
      await writeFile(baselinePath, baselineBuf);
      await writeFile(actualPath, PNG.sync.write(makePng(2, 2, () => [255, 255, 255, 255])));
      await writeFile(diffPath, baselineBuf);

      const pending: PendingDiff[] = [
        {
          name: "home",
          baselinePath,
          actualPath,
          diffPath,
          result: { width: 2, height: 2, differentPixels: 4, ignoredPixels: 0, ratio: 1, passed: false }
        }
      ];

      const input = Readable.from(["n\n"]);
      const output = new Writable({ write(_chunk, _enc, callback) { callback(); } });

      const outcomes = await runInteractiveApproval(pending, input, output);
      expect(outcomes).toEqual([{ name: "home", approved: false }]);

      const baselineAfter = await readFile(baselinePath);
      expect(baselineAfter.equals(baselineBuf)).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
