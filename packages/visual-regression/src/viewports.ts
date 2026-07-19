import { basename, dirname, extname, join } from "node:path";

/** Um viewport nomeado (ex.: desktop, mobile) usado para rodar/comparar em múltiplas resoluções. */
export interface Viewport {
  name: string;
  width: number;
  height: number;
}

/**
 * Deriva o caminho de baseline/atual para um viewport específico, organizando
 * os arquivos em subpastas por nome de viewport ao lado do arquivo base:
 *   baselines/home.png -> baselines/desktop/home.png, baselines/mobile/home.png
 */
export function pathForViewport(basePath: string, viewport: Viewport): string {
  const ext = extname(basePath);
  const stem = basename(basePath, ext);
  const dir = dirname(basePath);
  return join(dir, viewport.name, `${stem}${ext}`);
}

/**
 * Interpreta uma especificação de viewports no formato:
 *   "desktop:1440x900,mobile:375x667,tablet:768x1024"
 */
export function parseViewports(spec: string): Viewport[] {
  const parts = spec.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) throw new Error("Especificação de viewports vazia");
  return parts.map((part) => {
    const [name, dims] = part.split(":");
    if (!name || !dims) throw new Error(`Viewport inválido: "${part}" (esperado nome:LARGURAxALTURA)`);
    const [widthRaw, heightRaw] = dims.split("x");
    const width = Number(widthRaw);
    const height = Number(heightRaw);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0)
      throw new Error(`Dimensões inválidas para viewport "${name}": "${dims}"`);
    return { name, width, height };
  });
}
