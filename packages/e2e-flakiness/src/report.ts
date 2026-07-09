import { readJsonFile, writeJsonAtomic } from "../../core/src/io.js";
export interface TestRun { title: string; outcome: "passed" | "failed" | "skipped"; durationMs: number }
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
      const result = test.results?.at(-1);
      tests.push({
        title: [...current, spec.title, test.projectName].filter(Boolean).join(" › "),
        outcome: result?.status === "passed" ? "passed" : result?.status === "skipped" ? "skipped" : "failed",
        durationMs: result?.duration ?? 0
      });
    }
    for (const child of suite.suites ?? []) visit(child, current);
  };
  for (const suite of report.suites ?? []) visit(suite, []);
  return tests;
}
