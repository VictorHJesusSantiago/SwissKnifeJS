# log-aggregator

API NDJSON append-only para ingestão e busca de logs, sem dependência de
cloud/SIEM externo.

## Ingestão

- `POST /logs` — ingere uma entrada estruturada (`level`, `service`, `message`, ...).
- `POST /logs/parse` — ingere texto bruto (`{ "text": "..." }` ou `{ "lines": [...] }`)
  com **detecção automática de formato** por linha: JSON por linha, syslog
  RFC3164/RFC5424 e Apache/Nginx (combined/common log format). Os campos
  estruturados extraídos (host, status, priority, etc.) vão para `metadata`.
- `GET /logs` — filtra por `service`, `level`, `traceId`, `search` e `limit`.

## Busca (Query DSL)

- `GET /logs/search?q=...` — sintaxe tipo
  `campo:valor AND outro:valor OR "frase exata"`, com:
  - wildcards (`*`, `?`) em valores de campo: `service:api-*`
  - faixas de tempo: `timestamp:[2024-01-01T00:00:00Z TO 2024-01-02T00:00:00Z]`
  - negação: `-level:debug`
  - campos suportados: `message`, `level`, `service`, `traceId`, `timestamp`,
    `metadata.<chave>`

## Filtros salvos

- `POST /saved-queries` `{ "name": "erros-api", "query": "service:api AND level:error" }`
- `GET /saved-queries` — lista queries salvas
- `GET /saved-queries/:name/run` — executa uma query salva sobre os logs armazenados
- `DELETE /saved-queries/:id`

## Alertas locais

- `POST /alerts` — cria uma regra: `pattern` (regex ou substring) +
  `threshold` de ocorrências dentro de uma janela (`windowMs`). Ao bater o
  threshold, dispara notificação local: `webhook` genérico, `file` (append
  NDJSON) ou `console`.
- `GET /alerts` — lista regras.
- `DELETE /alerts/:id` — remove regra.

## Rotação e compactação

- `POST /rotate` — força verificação de idade/tamanho do arquivo ativo de
  logs; se exceder os limites, rotaciona e compacta com `gzip` (via
  `node:zlib`) para o diretório `archive/`, removendo arquivos compactados
  excedentes conforme `maxArchives`. Também é executado automaticamente após
  cada ingestão.

O formato em disco pode ser enviado depois a Loki, OpenSearch ou
armazenamento frio.
