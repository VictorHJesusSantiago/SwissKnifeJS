import { methods, type OpenApi } from "../../openapi-docgen/src/spec.js";
import { operationKey } from "./contractGenerator.js";
import type { Contract, ContractReport } from "./types.js";

export interface CoverageReport {
  total: number;
  covered: number;
  percentage: number;
  coveredOperations: string[];
  uncoveredOperations: string[];
}

/** Lista todas as operações "MÉTODO /caminho" declaradas na especificação OpenAPI. */
export function listSpecOperations(spec: OpenApi): string[] {
  const operations: string[] = [];
  for (const [path, item] of Object.entries(spec.paths)) {
    for (const method of methods) {
      if (item[method]) operations.push(`${method.toUpperCase()} ${path}`);
    }
  }
  return operations;
}

/** Extrai as operações "MÉTODO /caminho" cobertas por um contrato consumer-driven. */
export function operationsFromContract(contract: Contract): string[] {
  return contract.interactions.map((interaction) => operationKey(interaction.request));
}

/** Extrai as operações cobertas a partir de um relatório de execução de contrato (passadas e falhas). */
export function operationsFromContractReport(report: ContractReport): string[] {
  return report.failures.map((failure) => failure.operation.split(" (")[0]!);
}

/**
 * Calcula a cobertura de endpoints/métodos testados vs. o total declarado na spec.
 * `testedOperations` deve conter chaves no formato "MÉTODO /caminho" (o caminho
 * usado na spec, com chaves de parâmetro como `{id}` quando aplicável — chaves com
 * valores concretos como `/users/1` são casadas contra o template `/users/{id}`).
 */
export function computeCoverage(spec: OpenApi, testedOperations: Iterable<string>): CoverageReport {
  const allOperations = listSpecOperations(spec);
  const tested = new Set([...testedOperations].map(normalizeOperation));
  const templates = allOperations.map((operation) => ({ key: operation, regex: toRegex(operation) }));

  const coveredOperations: string[] = [];
  const uncoveredOperations: string[] = [];
  for (const { key, regex } of templates) {
    const isCovered = [...tested].some((operation) => regex.test(operation));
    (isCovered ? coveredOperations : uncoveredOperations).push(key);
  }

  const total = allOperations.length;
  const covered = coveredOperations.length;
  const percentage = total === 0 ? 100 : Math.round((covered / total) * 10000) / 100;
  return { total, covered, percentage, coveredOperations, uncoveredOperations };
}

function normalizeOperation(operation: string): string {
  const [method, ...rest] = operation.trim().split(/\s+/);
  const path = rest.join(" ").split("?")[0] || "/";
  return `${method!.toUpperCase()} ${path}`;
}

function toRegex(operation: string): RegExp {
  const [method, ...rest] = operation.split(" ");
  const path = rest.join(" ");
  const pattern = path
    .split("/")
    .map((segment) => (segment.startsWith("{") && segment.endsWith("}") ? "[^/]+" : escapeRegex(segment)))
    .join("/");
  return new RegExp(`^${method}\\s+${pattern}/?$`, "i");
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function formatCoverageReport(report: CoverageReport): string {
  const lines = [
    `Cobertura: ${report.covered}/${report.total} operações (${report.percentage}%)`,
    ""
  ];
  if (report.uncoveredOperations.length) {
    lines.push("Não cobertas:");
    for (const operation of report.uncoveredOperations) lines.push(`  - ${operation}`);
  } else {
    lines.push("Todas as operações da especificação estão cobertas.");
  }
  return lines.join("\n");
}
