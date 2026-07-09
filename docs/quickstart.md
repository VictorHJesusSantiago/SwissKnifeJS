# Início rápido

Cada ferramenta pode ser executada pelo script da raiz. Exemplos:

```bash
npm run uptime -- examples/uptime.config.json --once
npm run openapi-mock -- examples/petstore.yaml --port 4010
npm run openapi-docgen -- examples/petstore.yaml --out API.md
npm run logs -- --port 4080 --data .swissknife/logs.ndjson
```

As opções de cada CLI são exibidas com `--help`. Serviços aceitam `PORT` e outras
variáveis documentadas no README do pacote correspondente.

Os arquivos persistentes usam `.swissknife/` por padrão. Nenhuma credencial é
gravada: integrações leem tokens exclusivamente do ambiente.
