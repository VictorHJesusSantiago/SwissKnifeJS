# contract-tester

Testes de contrato HTTP baseados em OpenAPI, com dois modos de uso:

## 1. Validação direta da spec (`verify-spec`)

Percorre todas as operações de um documento OpenAPI contra um serviço real, cria
corpos mínimos, verifica o status documentado e valida tipos, propriedades
obrigatórias, arrays e enums da resposta. Retorna código de saída 1 quando há
quebra de contrato.

```sh
contract-test verify-spec ./spec.yaml --base-url http://localhost:3000
```

(compatibilidade retroativa: `contract-test ./spec.yaml --base-url http://localhost:3000` também funciona)

## 2. Contratos consumer-driven (formato Pact simplificado)

Fluxo "consumer-driven contracts": em vez de testar a spec inteira contra o
provider, você grava as interações reais que o consumidor realmente faz
(request/response), gera um contrato local em JSON, e depois reproduz esse
contrato contra o provider real — sem depender de nenhum serviço em nuvem.

### Gerar um contrato a partir de uma gravação do `openapi-mock`

O `openapi-mock` (`packages/openapi-mock/src/recorder.ts`) expõe
`createRecordingMockServer(spec, outputPath)`, que sobe um mock normal e grava
cada interação atendida em um arquivo **NDJSON** (uma interação JSON por
linha), no formato `RecordedInteraction`:

```json
{
  "timestamp": "2026-07-09T12:00:00.000Z",
  "method": "GET",
  "path": "/users/1",
  "requestHeaders": { "accept": "application/json" },
  "requestBody": null,
  "responseStatus": 200,
  "responseHeaders": { "content-type": "application/json; charset=utf-8" },
  "responseBody": { "id": 1 },
  "operationId": "get-/users/{id}"
}
```

Exemplo de uso programático:

```ts
import { createRecordingMockServer } from "@swissknife/openapi-mock/src/recorder.js";
import { loadSpec } from "@swissknife/openapi-docgen/src/spec.js";

const spec = await loadSpec("./spec.yaml");
const server = createRecordingMockServer(spec, "./recording.ndjson");
server.listen(4010);
// exercite seu consumidor real contra http://localhost:4010 normalmente...
```

Depois, converta a gravação em um contrato com o CLI do `contract-tester`:

```sh
contract-test record \
  --recording ./recording.ndjson \
  --consumer meu-frontend \
  --provider minha-api \
  --out ./contracts/minha-api.contract.json
```

Internamente isso usa `packages/contract-tester/src/mockIntegration.ts`
(`generateContractFromRecording`), que lê o NDJSON, deduplica interações
repetidas (mesmo método + caminho + status, mantém a mais recente) e monta um
`Contract` via `packages/contract-tester/src/contractGenerator.ts`.

### Verificar o contrato contra um provider real

```sh
contract-test verify-contract ./contracts/minha-api.contract.json --base-url http://localhost:3000
```

Cada interação do contrato é reproduzida contra o `--base-url`: o status HTTP
precisa bater exatamente, e o corpo da resposta é comparado por **formato**
(mesmas chaves/tipos — `shapeMatches`), não por igualdade exata de valores,
permitindo que o provider real devolva dados diferentes dos gravados desde que
a estrutura do contrato seja respeitada. Retorna código de saída 1 quando
alguma interação quebra.

### API programática (`contractGenerator.ts`)

- `recordInteraction(description, request, response, operationId?)`
- `createContract(consumer, provider, interactions)`
- `writeContract(path, contract)` / `loadContract(path)`
- `verifyContract(contract, baseUrl)` → `ContractReport`
- `shapeMatches(expected, actual)` → lista de erros de formato

## 3. Relatório de cobertura de endpoints (`coverage`)

Calcula quantos endpoints/métodos da spec OpenAPI foram efetivamente testados
(por um contrato consumer-driven ou por um relatório de execução), listando os
não cobertos.

```sh
# a partir de um contrato consumer-driven
contract-test coverage ./spec.yaml --contract ./contracts/minha-api.contract.json

# a partir de um relatório de execução do modo verify-spec (JSON salvo em disco)
contract-test verify-spec ./spec.yaml --base-url http://localhost:3000 > report.json
contract-test coverage ./spec.yaml --report report.json
```

Saída (`--json` para formato máquina):

```
Cobertura: 3/4 operações (75%)

Não cobertas:
  - DELETE /users/{id}
```

API programática (`coverageReport.ts`):

- `listSpecOperations(spec)` → todas as operações "MÉTODO /caminho" da spec
- `operationsFromContract(contract)` → operações cobertas por um contrato
- `operationsFromContractReport(report)` → operações presentes em um `ContractReport`
- `computeCoverage(spec, testedOperations)` → `{ total, covered, percentage, coveredOperations, uncoveredOperations }`
  (casamento de caminhos concretos como `/users/42` contra templates como `/users/{id}`)
- `formatCoverageReport(report)` → texto legível

## Módulos

| Arquivo | Responsabilidade |
| --- | --- |
| `validator.ts` | Validação de valor vs. schema OpenAPI + `testContract` (modo `verify-spec`) |
| `contractGenerator.ts` | Contratos consumer-driven: gravar, persistir, verificar |
| `mockIntegration.ts` | Ler gravações NDJSON do `openapi-mock` e gerar contratos |
| `coverageReport.ts` | Cobertura de endpoints da spec vs. testados |
| `types.ts` | Tipos compartilhados (`Contract`, `Interaction`, `ContractReport`, ...) |
