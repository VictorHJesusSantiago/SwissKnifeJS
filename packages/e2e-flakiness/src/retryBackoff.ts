export type BackoffStrategy = "linear" | "exponential";

export interface BackoffConfig {
  retries: number;
  delayMs: number;
  strategy: BackoffStrategy;
}

/** Pattern matched against a test title (substring or /regex/ literal) to override the default config. */
export interface BackoffRule extends BackoffConfig {
  pattern: string;
}

export interface BackoffConfigFile {
  default: BackoffConfig;
  rules: BackoffRule[];
}

export const DEFAULT_BACKOFF: BackoffConfig = { retries: 2, delayMs: 500, strategy: "linear" };

function patternMatches(pattern: string, title: string): boolean {
  if (pattern.startsWith("/") && pattern.lastIndexOf("/") > 0) {
    const lastSlash = pattern.lastIndexOf("/");
    const body = pattern.slice(1, lastSlash);
    const flags = pattern.slice(lastSlash + 1);
    try {
      return new RegExp(body, flags).test(title);
    } catch {
      return false;
    }
  }
  return title.includes(pattern);
}

/** Resolves the effective backoff config for a given test title, most specific (last matching) rule wins. */
export function resolveConfig(config: BackoffConfigFile, title: string): BackoffConfig {
  let resolved: BackoffConfig = config.default;
  for (const rule of config.rules) {
    if (patternMatches(rule.pattern, title)) {
      resolved = { retries: rule.retries, delayMs: rule.delayMs, strategy: rule.strategy };
    }
  }
  return resolved;
}

/** Delay (ms) to wait before attempt `attemptIndex` (1-based: the first retry is attemptIndex = 1). */
export function computeDelay(config: BackoffConfig, attemptIndex: number): number {
  if (attemptIndex < 1) return 0;
  if (config.strategy === "exponential") return Math.round(config.delayMs * 2 ** (attemptIndex - 1));
  return config.delayMs * attemptIndex;
}

export function computeDelaySchedule(config: BackoffConfig): number[] {
  return Array.from({ length: config.retries }, (_, index) => computeDelay(config, index + 1));
}

export function mergeBackoffConfigFile(partial: Partial<BackoffConfigFile>): BackoffConfigFile {
  return { default: { ...DEFAULT_BACKOFF, ...partial.default }, rules: partial.rules ?? [] };
}
