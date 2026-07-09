# openapi-mock

Cria rotas HTTP a partir de `paths`, escolhe a primeira resposta 2xx e gera
payload por `example` ou schema. O header `x-mock-status` força um status
documentado para testar erros.
