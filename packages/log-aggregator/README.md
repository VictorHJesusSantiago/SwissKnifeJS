# log-aggregator

API NDJSON append-only: `POST /logs` ingere e `GET /logs` filtra por `service`,
`level`, `traceId`, `search` e `limit`. Adequado a instalações pequenas; o
formato em disco pode ser enviado depois a Loki, OpenSearch ou armazenamento frio.
