import { readFile } from "node:fs/promises";

export interface ChaosDelay {
  /** Atraso fixo em milissegundos. */
  ms?: number;
  /** Atraso aleatório entre min e max (milissegundos). */
  min?: number;
  max?: number;
}

export interface ChaosError {
  /** Probabilidade de 0 a 1 de forçar um erro. */
  rate: number;
  /** Status code(s) candidatos para o erro forçado. */
  status?: number | number[];
  body?: unknown;
}

export interface ChaosRule {
  delay?: ChaosDelay;
  error?: ChaosError;
}

export type ChaosConfig = Record<string, ChaosRule>;

export interface ChaosOutcome {
  delayMs: number;
  forcedStatus?: number;
  forcedBody?: unknown;
}

/** Constrói a chave usada para localizar a regra de chaos de uma rota. */
export function chaosKey(method: string, template: string): string {
  return `${method.toUpperCase()} ${template}`;
}

/** Localiza a regra aplicável, com suporte a curinga "*" para todas as rotas. */
export function findChaosRule(config: ChaosConfig | undefined, method: string, template: string): ChaosRule | undefined {
  if (!config) return undefined;
  return config[chaosKey(method, template)] ?? config[template] ?? config["*"];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickStatus(status: number | number[] | undefined, fallback: number): number {
  if (status === undefined) return fallback;
  if (Array.isArray(status)) return status[randomInt(0, status.length - 1)] ?? fallback;
  return status;
}

/** Avalia uma regra de chaos e decide se deve atrasar e/ou forçar um erro. */
export function evaluateChaos(rule: ChaosRule | undefined): ChaosOutcome {
  if (!rule) return { delayMs: 0 };
  let delayMs = 0;
  if (rule.delay) {
    if (typeof rule.delay.ms === "number") delayMs = rule.delay.ms;
    else if (typeof rule.delay.min === "number" && typeof rule.delay.max === "number") {
      delayMs = randomInt(rule.delay.min, rule.delay.max);
    }
  }
  if (rule.error && Math.random() < rule.error.rate) {
    return { delayMs, forcedStatus: pickStatus(rule.error.status, 500), forcedBody: rule.error.body };
  }
  return { delayMs };
}

export function wait(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

export async function loadChaosConfig(path: string): Promise<ChaosConfig> {
  const text = await readFile(path, "utf8");
  return JSON.parse(text) as ChaosConfig;
}
