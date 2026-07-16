export interface ToolDefinition {
  name: string;
  description: string;
  script: string;
  healthUrl?: string;
}

export const TOOLS: ToolDefinition[] = [
  { name: "uptime", description: "Monitor HTTP, latência e validade de certificados TLS", script: "packages/uptime-ssl/src/cli.ts" },
  { name: "faq-bot", description: "FAQ e triagem por webhooks Slack/Teams", script: "packages/faq-bot/src/server.ts", healthUrl: "http://localhost:4070/health" },
  { name: "network-test", description: "Testes distribuídos de latência, download e upload", script: "packages/network-test/src/cli.ts" },
  { name: "cloud", description: "Interface comum para AWS, Azure e Google Cloud", script: "packages/multicloud-cli/src/cli.ts" },
  { name: "k8s-portal", description: "API self-service para namespaces Kubernetes", script: "packages/k8s-portal/src/server.ts", healthUrl: "http://localhost:4050/health" },
  { name: "openapi-mock", description: "Mock server gerado de um documento OpenAPI", script: "packages/openapi-mock/src/cli.ts" },
  { name: "openapi-docgen", description: "Validador e gerador de documentação OpenAPI", script: "packages/openapi-docgen/src/cli.ts" },
  { name: "contract-test", description: "Testes de contrato HTTP baseados em OpenAPI", script: "packages/contract-tester/src/cli.ts" },
  { name: "e2e-flakiness", description: "Executor Playwright com histórico de flakiness", script: "packages/e2e-flakiness/src/cli.ts" },
  { name: "visual-regression", description: "Comparação visual de screenshots PNG", script: "packages/visual-regression/src/cli.ts" },
  { name: "sprint-retro", description: "Retrospectiva automática de Jira/Azure DevOps", script: "packages/sprint-retro/src/cli.ts" },
  { name: "logs", description: "API leve para ingestão e busca de logs", script: "packages/log-aggregator/src/server.ts", healthUrl: "http://localhost:4080/health" }
];

export function findTool(name: string): ToolDefinition | undefined {
  return TOOLS.find((tool) => tool.name === name);
}
