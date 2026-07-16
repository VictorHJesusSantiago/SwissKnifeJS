import { readJsonFile, writeJsonAtomic } from "../../core/src/io.js";
export type Outcome = "passed" | "failed" | "skipped";
export interface TestRun { title: string; outcome: Outcome; durationMs: number; attempts?: Outcome[] }
export interface TestHistory { runs: Array<{ at: string; tests: TestRun[] }> }
export interface FlakyTest {
  title: string; runs: number; failures: number; passes: number; transitions: number; flakiness: number; averageMs: number;
}
export async function recordAndAnalyze(file: string, tests: TestRun[], maxRuns = 30): Promise<FlakyTest[]> {
  const history = await readJsonFile<TestHistory>(file, { runs: [] });
  history.runs.push({ at: new Date().toISOString(), tests });
  history.runs = history.runs.slice(-maxRuns);
  await writeJsonAtomic(file, history);
  const titles = new Set(history.runs.flatMap((run) => run.tests.map((test) => test.title)));
  return [...titles].map((title) => {
    const samples = history.runs.map((run) => run.tests.find((test) => test.title === title)).filter((x): x is TestRun => !!x);
    const failures = samples.filter((test) => test.outcome === "failed").length;
    const passes = samples.filter((test) => test.outcome === "passed").length;
    let transitions = 0;
    samples.slice(1).forEach((sample, index) => { if (sample.outcome !== samples[index]!.outcome) transitions += 1; });
    return {
      title, runs: samples.length, failures, passes, transitions,
      flakiness: samples.length < 2 || !failures || !passes ? 0 : Number(((failures / samples.length) * (1 + transitions / samples.length)).toFixed(3)),
      averageMs: Math.round(samples.reduce((sum, test) => sum + test.durationMs, 0) / samples.length)
    };
  }).filter((item) => item.flakiness > 0).sort((a, b) => b.flakiness - a.flakiness);
}

export function parsePlaywrightReport(report: any): TestRun[] {
  const tests: TestRun[] = [];
  const visit = (suite: any, parents: string[]): void => {
    const current = suite.title ? [...parents, suite.title] : parents;
    for (const spec of suite.specs ?? []) for (const test of spec.tests ?? []) {
      const results = (test.results ?? []) as Array<{ status?: string; duration?: number }>;
      const result = results.at(-1);
      const toOutcome = (status: string | undefined): Outcome =>
        status === "passed" ? "passed" : status === "skipped" ? "skipped" : "failed";
      tests.push({
        title: [...current, spec.title, test.projectName].filter(Boolean).join(" › "),
        outcome: toOutcome(result?.status),
        durationMs: result?.duration ?? 0,
        attempts: results.map((entry) => toOutcome(entry.status))
      });
    }
    for (const child of suite.suites ?? []) visit(child, current);
  };
  for (const suite of report.suites ?? []) visit(suite, []);
  return tests;
}
