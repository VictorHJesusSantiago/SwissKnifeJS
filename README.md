# SwissKnifeJS

Monorepo de ferramentas DevOps e produtividade escritas em TypeScript/Node.js.

## Ferramentas

| Pacote | Função |
| --- | --- |
| `uptime-ssl` | Monitor HTTP, latência e validade de certificados TLS |
| `faq-bot` | FAQ e triagem por webhooks Slack/Teams |
| `vscode-productivity` | Extensão com foco, notas rápidas e status |
| `snippet-manager` | Gerenciador desktop de snippets em Electron |
| `network-test` | Testes distribuídos de latência, download e upload |
| `multicloud-cli` | Interface comum para AWS, Azure e Google Cloud |
| `k8s-portal` | API self-service para namespaces Kubernetes |
| `openapi-mock` | Mock server gerado de um documento OpenAPI |
| `openapi-docgen` | Validador e gerador de documentação OpenAPI |
| `contract-tester` | Testes de contrato HTTP baseados em OpenAPI |
| `e2e-flakiness` | Executor Playwright com histórico de flakiness |
| `visual-regression` | Comparação visual de screenshots PNG |
| `sprint-retro` | Retrospectiva automática de Jira/Azure DevOps |
| `log-aggregator` | API leve para ingestão e busca de logs |

## Uso

Requer Node.js 20+.

```bash
npm install
npm run build
npm test
```

Os comandos ficam disponíveis como scripts `npm run <nome> -- ...`. Consulte
[`docs/quickstart.md`](docs/quickstart.md) e o README de cada pacote.

## Princípios

- armazenamento local simples e transparente;
- configuração por JSON e variáveis de ambiente;
- APIs HTTP sem dependência de infraestrutura externa;
- validação de entrada e encerramento gracioso;
- componentes pequenos que também podem ser importados como biblioteca.
