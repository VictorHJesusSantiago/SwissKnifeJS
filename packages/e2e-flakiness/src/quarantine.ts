import { readJsonFile, writeJsonAtomic } from "../../core/src/io.js";
import type { Outcome, TestRun } from "./report.js";

export interface QuarantineEntry {
  title: string;
  reason: string;
  quarantinedAt: string;
  lastSeenAt: string;
  occurrences: number;
}

export interface QuarantineList {
  entries: QuarantineEntry[];
}

/** A run is intermittent when at least one attempt failed but the test's final outcome passed. */
export function isIntermittent(attempts: Outcome[] | undefined): boolean {
  if (!attempts || attempts.length < 2) return false;
  const last = attempts.at(-1);
  return last === "passed" && attempts.slice(0, -1).some((outcome) => outcome === "failed");
}

export function detectIntermittentTests(tests: TestRun[]): TestRun[] {
  return tests.filter((test) => isIntermittent(test.attempts));
}

export async function loadQuarantine(file: string): Promise<QuarantineList> {
  return readJsonFile<QuarantineList>(file, { entries: [] });
}

export async function saveQuarantine(file: string, list: QuarantineList): Promise<void> {
  await writeJsonAtomic(file, list);
}

export function isQuarantined(list: QuarantineList, title: string): boolean {
  return list.entries.some((entry) => entry.title === title);
}

/**
 * Scans the latest batch of test results, adds any newly detected intermittent
 * tests to the quarantine list (or bumps their occurrence count) and persists it.
 */
export async function updateQuarantine(file: string, tests: TestRun[]): Promise<QuarantineList> {
  const list = await loadQuarantine(file);
  const now = new Date().toISOString();
  for (const test of detectIntermittentTests(tests)) {
    const existing = list.entries.find((entry) => entry.title === test.title);
    if (existing) {
      existing.occurrences += 1;
      existing.lastSeenAt = now;
    } else {
      list.entries.push({
        title: test.title,
        reason: "falhou e depois passou em retry (intermitente)",
        quarantinedAt: now,
        lastSeenAt: now,
        occurrences: 1
      });
    }
  }
  await saveQuarantine(file, list);
  return list;
}

export async function removeFromQuarantine(file: string, title: string): Promise<QuarantineList> {
  const list = await loadQuarantine(file);
  list.entries = list.entries.filter((entry) => entry.title !== title);
  await saveQuarantine(file, list);
  return list;
}

export interface PartitionedTests {
  active: TestRun[];
  quarantined: TestRun[];
}

/** Splits tests into the ones that should still gate the run and the quarantined ones, reported separately. */
export function partitionByQuarantine(list: QuarantineList, tests: TestRun[]): PartitionedTests {
  const active: TestRun[] = [];
  const quarantined: TestRun[] = [];
  for (const test of tests) (isQuarantined(list, test.title) ? quarantined : active).push(test);
  return { active, quarantined };
}
