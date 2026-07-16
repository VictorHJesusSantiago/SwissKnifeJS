/** Requisição HTTP capturada/gravada de uma interação consumer-driven. */
export interface ContractRequest {
  method: string;
  path: string;
  headers?: Record<string, string>;
  body?: unknown;
}

/** Resposta HTTP capturada/gravada de uma interação consumer-driven. */
export interface ContractResponse {
  status: number;
  headers?: Record<string, string>;
  body?: unknown;
}

/** Uma interação individual dentro de um contrato (formato Pact simplificado). */
export interface Interaction {
  description: string;
  operationId?: string;
  request: ContractRequest;
  response: ContractResponse;
}

/** Contrato consumer-driven no formato Pact simplificado. */
export interface Contract {
  consumer: string;
  provider: string;
  createdAt: string;
  interactions: Interaction[];
}

export interface ContractFailure { operation: string; message: string }
export interface ContractReport { passed: number; failed: number; failures: ContractFailure[] }
