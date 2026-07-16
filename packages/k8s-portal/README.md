# k8s-portal

API para solicitar, aprovar e aplicar namespaces com `ResourceQuota`. Aprovação
exige `Authorization: Bearer $ADMIN_TOKEN`. `{"apply":true}` executa `kubectl`
usando o contexto ativo; sem isso retorna o manifesto para GitOps/revisão.

## Templates de namespace

`POST /templates` cria um template reutilizável (`name`, `defaultCpu`,
`defaultLimitsCpu`, `defaultMemory`, `defaultLimitsMemory`, `requiredLabels`,
`networkPolicies`). `POST /templates/:id/namespaces` gera o manifesto
(Namespace + ResourceQuota + NetworkPolicy) a partir do template, recebendo
`{ name, owner, team, cpu?, memory?, limitsCpu?, limitsMemory?, labels? }`.

As labels do namespace gerado são sempre prefixadas com `portal.swissknife/`
(ex.: `portal.swissknife/team`, `portal.swissknife/owner`). Ao declarar
`requiredLabels` em um template você pode usar tanto a forma curta (`"team"`)
quanto a forma já prefixada (`"portal.swissknife/team"`) — ambas são aceitas
e validadas contra as mesmas labels geradas.

## Validação de políticas

`POST /policies/validate` recebe `{ manifest, requiredLabels? }` e retorna as
violações encontradas (labels obrigatórias ausentes, `privileged: true`,
containers sem `requests`/`limits`).

## Auditoria

`GET /audit` lista o log local (append-only) de ações realizadas no portal
(criação/aprovação/rejeição/aplicação de namespaces, criação de templates
etc.), com filtros por `actor`, `action`, `target` e `since`.

## Relatório de uso de recursos

`POST /usage` registra uma amostra de uso (`namespace`, `cpu`, `memory`) e
`GET /reports/usage?format=json|csv` agrega o uso mais recente por namespace
contra a quota aplicada, retornando percentual de utilização.
