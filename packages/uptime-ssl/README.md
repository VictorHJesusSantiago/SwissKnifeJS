# uptime-ssl

Monitora disponibilidade, status HTTP, latência e expiração TLS. Execute com um
JSON contendo `targets`, `intervalSeconds` e, opcionalmente, `alert`,
`historyFile` e `regions`. Use `--once` para integração com cron; sem essa
opção o processo agenda as checagens.

## Configuração

```json
{
  "intervalSeconds": 60,
  "sslWarningDays": 14,
  "historyFile": "./data/history.ndjson",
  "alert": {
    "url": "http://localhost:9000/hooks/uptime",
    "method": "POST",
    "headers": { "x-api-key": "segredo" }
  },
  "targets": [
    { "name": "site", "url": "https://example.com", "sslWarningDays": 21 }
  ],
  "regions": [
    { "name": "local", "resolver": "1.1.1.1" },
    { "name": "via-proxy", "proxyUrl": "http://127.0.0.1:8080" }
  ]
}
```

## Comandos

- `uptime-ssl <config.json> [--once]` — executa as checagens, grava histórico
  (se `historyFile` configurado) e dispara `alert` (webhook genérico, JSON via
  POST configurável) quando um site cai ou o certificado expira em até
  `sslWarningDays` dias.
- `uptime-ssl export --history <arquivo> --format csv|json [--out <arquivo>]`
  — exporta o histórico de uptime em CSV ou JSON.
- `uptime-ssl dashboard --history <arquivo> [--out <arquivo>]` — gera um
  dashboard HTML standalone (sem CDN/servidor) com um gráfico SVG de uptime
  por alvo.
- `uptime-ssl dns --host <hostname> [--types A,AAAA,CNAME,MX,TXT,NS,SOA] [--resolver <ip> | --resolvers <ip1,ip2>]`
  — resolve registros DNS e, com `--resolvers`, compara respostas entre
  múltiplos resolvers.
- `uptime-ssl regions <config.json>` — roda a checagem de cada target através
  das "regiões" configuradas (resolver DNS específico ou proxy HTTP),
  simulando checagens multi-região sem infraestrutura externa.
