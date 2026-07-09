import type { SprintData } from "./providers.js";
export function retrospective(data: SprintData): string {
  const done = data.items.filter((item) => /done|closed|resolved|conclu/i.test(item.status));
  const pending = data.items.filter((item) => !done.includes(item));
  const points = done.reduce((sum, item) => sum + (item.points ?? 0), 0);
  const bugs = data.items.filter((item) => /bug|defect|erro/i.test(item.type));
  const people = new Map<string, number>();
  done.forEach((item) => { if (item.assignee) people.set(item.assignee, (people.get(item.assignee) ?? 0) + 1); });
  const lines = [
    `# Retrospectiva — ${data.name}`, "", `Período: ${data.start ?? "?"} a ${data.end ?? "?"}`, "",
    "## Resumo", "", `- ${done.length} itens concluídos de ${data.items.length}`,
    `- ${points} pontos entregues`, `- ${bugs.length} bugs/defeitos no escopo`, `- ${pending.length} itens pendentes`, "",
    "## Entregas", "", ...done.map((item) => `- **${item.id}** ${item.title}`), "",
    "## Para acompanhar", "", ...(pending.length ? pending.map((item) => `- **${item.id}** ${item.title} — ${item.status}`) : ["- Nenhum item pendente"]), "",
    "## Participação", "", ...[...people].sort((a,b) => b[1]-a[1]).map(([name,count]) => `- ${name}: ${count} item(ns) concluído(s)`), "",
    "## Perguntas para a reunião", "", "- O que tornou as entregas mais fluidas?", "- Onde houve espera, retrabalho ou dependência?",
    "- Qual experimento pequeno faremos na próxima sprint?", ""
  ];
  return `${lines.join("\n")}\n`;
}
