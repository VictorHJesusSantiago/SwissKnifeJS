# openapi-mock

Cria rotas HTTP a partir de `paths`, escolhe a primeira resposta 2xx e gera
payload por `example` ou schema. O header `x-mock-status` força um status
documentado para testar erros.

```
openapi-mock <spec.yaml|json> [--port 4010] [--chaos chaos.json] [--faker]
             [--scenarios scenarios.json] [--ws ws.json]
openapi-mock --record --target http://localhost:3000 [--out ./recordings] [--port 4010]
openapi-mock --generate-scenarios [--recordings ./recordings] [--out ./scenarios.json]
```

## Chaos testing (`--chaos chaos.json`)

Delay e taxa de erro configuráveis por rota. Chave `"METHOD /caminho"`,
`"/caminho"` (qualquer método) ou `"*"` (curinga para todas as rotas):

```json
{
  "GET /users": {
    "delay": { "ms": 200 },
    "error": { "rate": 0.3, "status": 503 }
  },
  "*": {
    "delay": { "min": 50, "max": 300 }
  }
}
```

`error.rate` é a probabilidade (0 a 1) de forçar o `status` (ou um dos
`status` sorteado, se for array) no lugar da resposta normal.

## Dados fake realistas (`--faker`)

Gera valores via `@faker-js/faker` a partir do `format`/nome dos campos do
schema (uuid, email, date-time, uri, ipv4/6, nomes, preços, status etc.),
em vez dos exemplos genéricos padrão.

## Gravação e replay (`--record` / `--generate-scenarios` / `--scenarios`)

1. `openapi-mock --record --target http://localhost:3000 --out ./recordings`
   sobe um proxy reverso: cada requisição é repassada ao backend real e o
   par requisição/resposta é salvo em `./recordings`.
2. `openapi-mock --generate-scenarios --recordings ./recordings --out ./scenarios.json`
   converte as gravações em cenários de mock (método, caminho, status, corpo).
3. `openapi-mock spec.json --scenarios ./scenarios.json` serve esses cenários
   (checados antes do matching por spec).

## Mock de WebSocket (`--ws ws.json`)

```json
[
  {
    "path": "/ws/chat",
    "onOpen": [{ "type": "welcome" }],
    "scripted": [
      { "when": "ping", "reply": { "type": "pong" } },
      { "match": "^oi", "reply": [{ "type": "ack" }, { "type": "resposta" }], "delayMs": 100 }
    ]
  }
]
```

`when` casa texto exato; `match` é uma regex (como string). `reply` pode ser
uma mensagem única ou uma lista enviada em sequência.
