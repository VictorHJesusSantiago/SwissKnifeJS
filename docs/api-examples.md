# Exemplos de API

## Portal Kubernetes

```http
POST /namespaces
Content-Type: application/json

{"name":"time-pagamentos","owner":"ana","team":"payments","cpu":"4","memory":"8Gi"}
```

```http
POST /namespaces/{id}/approve
Authorization: Bearer <ADMIN_TOKEN>
Content-Type: application/json

{"apply":false,"reason":"Quota aprovada"}
```

## Agregador de logs

```http
POST /logs
Content-Type: application/json

{"level":"error","service":"checkout","message":"Gateway timeout","traceId":"abc-123"}
```

Busque com `GET /logs?service=checkout&level=error&limit=50`.

## FAQ

Envie `POST /` com `{"text":"Como redefinir minha senha?"}`. Para um slash
command do Slack, use `application/x-www-form-urlencoded` com `text` e
`response_url`.
