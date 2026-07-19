import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  detectIntermittentTests,
  isIntermittent,
  isQuarantined,
  partitionByQuarantine,
  removeFromQuarantine,
  updateQuarantine
} from "../packages/e2e-flakiness/src/quarantine.js";
import type { TestRun } from "../packages/e2e-flakiness/src/report.js";

describe("quarantine", () => {
  let dir: string;
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), "e2e-quarantine-")); });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

  it("identifica intermitência quando falha e depois passa em retry", () => {
    expect(isIntermittent(["failed", "passed"])).toBe(true);
    expect(isIntermittent(["failed", "failed"])).toBe(false);
    expect(isIntermittent(["passed"])).toBe(false);
    expect(isIntermittent(undefined)).toBe(false);
  });

  it("detecta testes intermitentes num lote", () => {
    const tests: TestRun[] = [
      { title: "a", outcome: "passed", durationMs: 1, attempts: ["failed", "passed"] },
      { title: "b", outcome: "failed", durationMs: 1, attempts: ["failed", "failed"] },
      { title: "c", outcome: "passed", durationMs: 1, attempts: ["passed"] }
    ];
    expect(detectIntermittentTests(tests).map((t) => t.title)).toEqual(["a"]);
  });

  it("adiciona teste intermitente à quarentena e persiste em disco", async () => {
    const file = join(dir, "quarantine.json");
    const tests: TestRun[] = [{ title: "flaky-1", outcome: "passed", durationMs: 1, attempts: ["failed", "passed"] }];
    const list = await updateQuarantine(file, tests);
    expect(list.entries).toHaveLength(1);
    expect(list.entries[0]).toMatchObject({ title: "flaky-1", occurrences: 1 });

    const list2 = await updateQuarantine(file, tests);
    expect(list2.entries[0]).toMatchObject({ occurrences: 2 });
  });

  it("não quarentena testes que falham consistentemente ou passam direto", async () => {
    const file = join(dir, "quarantine.json");
    const tests: TestRun[] = [
      { title: "consistent-fail", outcome: "failed", durationMs: 1, attempts: ["failed", "failed"] },
      { title: "clean-pass", outcome: "passed", durationMs: 1, attempts: ["passed"] }
    ];
    const list = await updateQuarantine(file, tests);
    expect(list.entries).toHaveLength(0);
  });

  it("particiona testes ativos e quarentenados, permitindo pular/relatar separadamente", async () => {
    const file = join(dir, "quarantine.json");
    const tests: TestRun[] = [{ title: "flaky-2", outcome: "passed", durationMs: 1, attempts: ["failed", "passed"] }];
    const list = await updateQuarantine(file, tests);
    const nextRun: TestRun[] = [
      { title: "flaky-2", outcome: "failed", durationMs: 1 },
      { title: "stable", outcome: "passed", durationMs: 1 }
    ];
    const { active, quarantined } = partitionByQuarantine(list, nextRun);
    expect(active.map((t) => t.title)).toEqual(["stable"]);
    expect(quarantined.map((t) => t.title)).toEqual(["flaky-2"]);
    expect(isQuarantined(list, "flaky-2")).toBe(true);
  });

  it("permite remover manualmente um teste da quarentena", async () => {
    const file = join(dir, "quarantine.json");
    await updateQuarantine(file, [{ title: "flaky-3", outcome: "passed", durationMs: 1, attempts: ["failed", "passed"] }]);
    const after = await removeFromQuarantine(file, "flaky-3");
    expect(after.entries).toHaveLength(0);
  });
});
