import { describe, expect, it } from "vitest";
import { parsePlaywrightReport } from "../packages/e2e-flakiness/src/report.js";
describe("relatório Playwright", () => {
  it("normaliza testes", () => {
    const result = parsePlaywrightReport({ suites: [{ title: "suite", specs: [{ title: "test", tests: [
      { projectName: "chromium", results: [{ status: "passed", duration: 12 }] }
    ] }] }] });
    expect(result[0]).toMatchObject({ outcome: "passed", durationMs: 12 });
  });
});
