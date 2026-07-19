import { describe, expect, it } from "vitest";
import {
  DEFAULT_BACKOFF,
  computeDelay,
  computeDelaySchedule,
  mergeBackoffConfigFile,
  resolveConfig
} from "../packages/e2e-flakiness/src/retryBackoff.js";

describe("retryBackoff", () => {
  it("calcula delay linear", () => {
    const config = { retries: 3, delayMs: 100, strategy: "linear" as const };
    expect(computeDelay(config, 1)).toBe(100);
    expect(computeDelay(config, 2)).toBe(200);
    expect(computeDelay(config, 3)).toBe(300);
  });

  it("calcula delay exponencial", () => {
    const config = { retries: 3, delayMs: 100, strategy: "exponential" as const };
    expect(computeDelay(config, 1)).toBe(100);
    expect(computeDelay(config, 2)).toBe(200);
    expect(computeDelay(config, 3)).toBe(400);
  });

  it("gera o cronograma completo de delays", () => {
    const config = { retries: 3, delayMs: 100, strategy: "exponential" as const };
    expect(computeDelaySchedule(config)).toEqual([100, 200, 400]);
  });

  it("usa o default quando nenhuma regra casa", () => {
    const configFile = mergeBackoffConfigFile({ rules: [{ pattern: "checkout", retries: 5, delayMs: 1000, strategy: "linear" }] });
    expect(resolveConfig(configFile, "login flow")).toEqual(DEFAULT_BACKOFF);
  });

  it("sobrepõe config por padrão de substring", () => {
    const configFile = mergeBackoffConfigFile({ rules: [{ pattern: "checkout", retries: 5, delayMs: 1000, strategy: "exponential" }] });
    expect(resolveConfig(configFile, "checkout › paga com cartão")).toEqual({ retries: 5, delayMs: 1000, strategy: "exponential" });
  });

  it("sobrepõe config por padrão regex", () => {
    const configFile = mergeBackoffConfigFile({ rules: [{ pattern: "/^api-.*$/", retries: 1, delayMs: 50, strategy: "linear" }] });
    expect(resolveConfig(configFile, "api-health")).toEqual({ retries: 1, delayMs: 50, strategy: "linear" });
    expect(resolveConfig(configFile, "ui-health")).toEqual(DEFAULT_BACKOFF);
  });

  it("a última regra que casa vence quando várias combinam", () => {
    const configFile = mergeBackoffConfigFile({
      rules: [
        { pattern: "checkout", retries: 2, delayMs: 100, strategy: "linear" },
        { pattern: "cartão", retries: 9, delayMs: 900, strategy: "exponential" }
      ]
    });
    expect(resolveConfig(configFile, "checkout › paga com cartão")).toEqual({ retries: 9, delayMs: 900, strategy: "exponential" });
  });
});
