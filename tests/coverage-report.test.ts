import { describe, expect, it } from "vitest";
import { computeCoverage, listSpecOperations, operationsFromContract, operationsFromContractReport } from "../packages/contract-tester/src/coverageReport.js";
import { createContract, recordInteraction } from "../packages/contract-tester/src/contractGenerator.js";
import type { ContractReport } from "../packages/contract-tester/src/types.js";
import type { OpenApi } from "../packages/openapi-docgen/src/spec.js";

const spec: OpenApi = {
  openapi: "3.0.3",
  info: { title: "Coverage", version: "1" },
  paths: {
    "/users": {
      get: { responses: { "200": { description: "ok" } } },
      post: { responses: { "201": { description: "criado" } } }
    },
    "/users/{id}": {
      get: { responses: { "200": { description: "ok" } } },
      delete: { responses: { "204": { description: "ok" } } }
    }
  }
};

describe("coverageReport", () => {
  it("lista todas as operações da spec", () => {
    expect(listSpecOperations(spec)).toEqual([
      "GET /users", "POST /users", "GET /users/{id}", "DELETE /users/{id}"
    ]);
  });

  it("calcula cobertura, casando caminhos concretos com templates", () => {
    const coverage = computeCoverage(spec, ["GET /users", "GET /users/42"]);
    expect(coverage.total).toBe(4);
    expect(coverage.covered).toBe(2);
    expect(coverage.percentage).toBe(50);
    expect(coverage.uncoveredOperations).toEqual(["POST /users", "DELETE /users/{id}"]);
  });

  it("retorna 100% quando não há operações na spec", () => {
    const empty: OpenApi = { openapi: "3.0.3", info: { title: "x", version: "1" }, paths: {} };
    expect(computeCoverage(empty, []).percentage).toBe(100);
  });

  it("extrai operações cobertas de um contrato", () => {
    const contract = createContract("c", "p", [
      recordInteraction("lista usuários", { method: "GET", path: "/users" }, { status: 200 })
    ]);
    expect(operationsFromContract(contract)).toEqual(["GET /users"]);
  });

  it("extrai operações cobertas (passadas e falhas) de um relatório de execução (validator)", () => {
    const report: ContractReport = {
      passed: 1,
      failed: 1,
      passedOperations: ["GET /users"],
      failures: [{ operation: "POST /users (falhou)", message: "erro" }]
    };
    expect(operationsFromContractReport(report)).toEqual(["GET /users", "POST /users"]);
  });
});
