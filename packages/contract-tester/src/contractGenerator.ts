import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Contract, ContractFailure, ContractReport, ContractRequest, ContractResponse, Interaction } from "./types.js";

/**
 * Módulo de contratos "consumer-driven" (formato Pact simplificado, local, em JSON).
 *
 * Fluxo:
 * 1. Gravar interações reais (requisição + resposta) contra um mock com `recordInteraction`.
 * 2. Agrupá-las com `createContract`.
 * 3. Persistir com `writeContract` / carregar com `loadContract`.
 * 4. Reproduzir as interações contra um provider real com `verifyContract`.
 */

export function recordInteraction(
  description: string,
  request: ContractRequest,
  response: ContractResponse,
  operationId?: string
): Interaction {
  return { description, operationId, request, response };
}

export function createContract(consumer: string, provider: string, interactions: Interaction[]): Contract {
  return { consumer, provider, createdAt: new Date().toISOString(), interactions };
}

export async function writeContract(path: string, contract: Contract): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(contract, null, 2)}\n`, "utf8");
}

export async function loadContract(path: string): Promise<Contract> {
  const text = await readFile(path, "utf8");
  const contract = JSON.parse(text) as Contract;
  if (!contract.consumer || !contract.provider || !Array.isArray(contract.interactions)) {
    throw new Error(`Contrato inválido em ${path}: campos consumer/provider/interactions obrigatórios`);
  }
  return contract;
}

/** Chave canônica "MÉTODO /caminho" usada para reportar/cobrir uma interação. */
export function operationKey(request: ContractRequest): string {
  return `${request.method.toUpperCase()} ${normalizePath(request.path)}`;
}

function normalizePath(path: string): string {
  const [pathname] = path.split("?");
  return pathname || "/";
}

/**
 * Compara recursivamente o "formato" de dois valores (chaves e tipos), ignorando
 * valores concretos — isso permite que o provider retorne dados diferentes dos
 * gravados, desde que a estrutura do contrato seja respeitada.
 */
export function shapeMatches(expected: unknown, actual: unknown, path = "$"): string[] {
  if (expected === undefined) return [];
  if (expected === null) return actual === null ? [] : [`${path} deveria ser null`];
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) return [`${path} deveria ser array`];
    if (expected.length === 0) return [];
    const errors: string[] = [];
    actual.forEach((item, index) => errors.push(...shapeMatches(expected[0], item, `${path}[${index}]`)));
    return errors;
  }
  if (typeof expected === "object") {
    if (!actual || typeof actual !== "object" || Array.isArray(actual)) return [`${path} deveria ser objeto`];
    const errors: string[] = [];
    for (const [key, value] of Object.entries(expected as Record<string, unknown>)) {
      if (!(key in (actual as Record<string, unknown>))) {
        errors.push(`${path}.${key} ausente na resposta`);
        continue;
      }
      errors.push(...shapeMatches(value, (actual as Record<string, unknown>)[key], `${path}.${key}`));
    }
    return errors;
  }
  if (typeof expected !== typeof actual) return [`${path} deveria ser do tipo ${typeof expected}, recebeu ${typeof actual}`];
  return [];
}

function buildRequestUrl(baseUrl: string, request: ContractRequest): URL {
  const path = request.path.startsWith("/") ? request.path.slice(1) : request.path;
  return new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
}

/** Reproduz cada interação do contrato contra um provider real e valida status + formato do corpo. */
export async function verifyContract(contract: Contract, baseUrl: string): Promise<ContractReport> {
  const failures: ContractFailure[] = [];
  let passed = 0;
  for (const interaction of contract.interactions) {
    const label = interaction.operationId ?? `${operationKey(interaction.request)} (${interaction.description})`;
    try {
      const url = buildRequestUrl(baseUrl, interaction.request);
      const hasBody = interaction.request.body !== undefined;
      const response = await fetch(url, {
        method: interaction.request.method.toUpperCase(),
        headers: {
          ...(hasBody ? { "content-type": "application/json" } : {}),
          ...(interaction.request.headers ?? {})
        },
        body: hasBody ? JSON.stringify(interaction.request.body) : undefined
      });
      if (response.status !== interaction.response.status) {
        throw new Error(`status esperado ${interaction.response.status}, recebido ${response.status}`);
      }
      if (interaction.response.body !== undefined) {
        const contentType = response.headers.get("content-type") ?? "";
        const actualBody = contentType.includes("application/json") ? await response.json() : await response.text();
        const errors = shapeMatches(interaction.response.body, actualBody);
        if (errors.length) throw new Error(errors.join("; "));
      }
      passed += 1;
    } catch (error) {
      failures.push({ operation: label, message: error instanceof Error ? error.message : String(error) });
    }
  }
  return { passed, failed: failures.length, failures };
}
