import { readFile } from "node:fs/promises";
import { createContract, recordInteraction } from "./contractGenerator.js";
import type { Contract, Interaction } from "./types.js";

/**
 * Integração com `packages/openapi-mock`.
 *
 * O recorder do openapi-mock (`packages/openapi-mock/src/recorder.ts`,
 * `createRecordingMockServer`) grava cada interação atendida pelo mock em um
 * arquivo NDJSON (uma interação JSON por linha), no formato `RecordedInteraction`:
 *
 * ```json
 * {
 *   "timestamp": "2026-07-09T12:00:00.000Z",
 *   "method": "GET",
 *   "path": "/users/1",
 *   "requestHeaders": { "accept": "application/json" },
 *   "requestBody": null,
 *   "responseStatus": 200,
 *   "responseHeaders": { "content-type": "application/json; charset=utf-8" },
 *   "responseBody": { "id": 1 },
 *   "operationId": "get-/users/{id}"
 * }
 * ```
 *
 * Este módulo lê esse arquivo e o converte em um `Contract` (contrato
 * consumer-driven) usando `contractGenerator`, pronto para ser verificado
 * contra um provider real com `verifyContract`.
 */

export interface RecordedInteraction {
  timestamp: string;
  method: string;
  path: string;
  requestHeaders: Record<string, string>;
  requestBody: unknown;
  responseStatus: number;
  responseHeaders: Record<string, string>;
  responseBody: unknown;
  operationId?: string;
}

export function parseRecordingLine(line: string): RecordedInteraction {
  return JSON.parse(line) as RecordedInteraction;
}

export async function readRecordedInteractions(path: string): Promise<RecordedInteraction[]> {
  const text = await readFile(path, "utf8");
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map(parseRecordingLine);
}

export function recordedToInteraction(record: RecordedInteraction): Interaction {
  const request = {
    method: record.method,
    path: record.path,
    headers: record.requestHeaders,
    body: record.requestBody === null ? undefined : record.requestBody
  };
  const response = {
    status: record.responseStatus,
    headers: record.responseHeaders,
    body: record.responseBody === null ? undefined : record.responseBody
  };
  return recordInteraction(
    record.operationId ?? `${record.method.toUpperCase()} ${record.path}`,
    request,
    response,
    record.operationId
  );
}

/** Deduplica interações repetidas (mesmo método + caminho + status), mantendo a mais recente. */
function dedupeInteractions(records: RecordedInteraction[]): RecordedInteraction[] {
  const byKey = new Map<string, RecordedInteraction>();
  for (const record of records) {
    const key = `${record.method.toUpperCase()} ${record.path.split("?")[0]} ${record.responseStatus}`;
    byKey.set(key, record);
  }
  return [...byKey.values()];
}

/** Lê o arquivo NDJSON gravado pelo recorder do openapi-mock e monta um `Contract`. */
export async function generateContractFromRecording(
  recordingPath: string,
  consumer: string,
  provider: string,
  options: { dedupe?: boolean } = {}
): Promise<Contract> {
  const records = await readRecordedInteractions(recordingPath);
  const filtered = options.dedupe === false ? records : dedupeInteractions(records);
  const interactions = filtered.map(recordedToInteraction);
  return createContract(consumer, provider, interactions);
}
