/**
 * Suporte a tolerância de diferença configurável por região da imagem.
 * Permite ignorar áreas dinâmicas (relógios, ads, etc.) ou definir um
 * limiar de diferença de cor específico para uma sub-região retangular.
 */
export interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Ignora completamente qualquer diferença dentro da região. */
  ignore?: boolean;
  /** Limiar de diferença de cor (0-1) específico para a região. */
  threshold?: number;
  /** Nome opcional, útil para depuração/relatórios. */
  name?: string;
}

export function isInRegion(x: number, y: number, region: Region): boolean {
  return x >= region.x && x < region.x + region.width && y >= region.y && y < region.y + region.height;
}

/**
 * Resolve o limiar efetivo para um pixel considerando as regiões configuradas.
 * Regiões posteriores na lista têm prioridade sobre as anteriores quando
 * se sobrepõem. Retorna `null` quando o pixel deve ser ignorado por completo.
 */
export function thresholdForPixel(x: number, y: number, baseThreshold: number, regions: readonly Region[]): number | null {
  let threshold = baseThreshold;
  let ignored = false;
  for (const region of regions) {
    if (!isInRegion(x, y, region)) continue;
    if (region.ignore) {
      ignored = true;
      continue;
    }
    ignored = false;
    if (typeof region.threshold === "number") threshold = region.threshold;
  }
  return ignored ? null : threshold;
}

export function validateRegions(regions: readonly Region[]): void {
  for (const region of regions) {
    if (region.width <= 0 || region.height <= 0) throw new Error(`Região inválida: ${JSON.stringify(region)}`);
    if (typeof region.threshold === "number" && (region.threshold < 0 || region.threshold > 1))
      throw new Error(`threshold da região deve estar entre 0 e 1: ${JSON.stringify(region)}`);
  }
}
