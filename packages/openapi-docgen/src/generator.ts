import { methods, type OpenApi } from "./spec.js";

export function generateMarkdown(spec: OpenApi): string {
  const lines = [`# ${spec.info.title}`, "", `Versão: \`${spec.info.version}\``, ""];
  if (spec.info.description) lines.push(spec.info.description, "");
  if (spec.servers?.length) lines.push("## Servidores", "", ...spec.servers.map((s) => `- \`${s.url}\``), "");
  lines.push("## Endpoints", "");
  for (const [path, item] of Object.entries(spec.paths)) for (const method of methods) {
    const operation = item[method];
    if (!operation) continue;
    lines.push(`### ${method.toUpperCase()} \`${path}\``, "", operation.summary ?? operation.description ?? "", "");
    if (operation.parameters?.length) {
      lines.push("| Parâmetro | Local | Obrigatório | Descrição |", "| --- | --- | --- | --- |");
      for (const p of operation.parameters)
        lines.push(`| \`${p.name}\` | ${p.in} | ${p.required ? "sim" : "não"} | ${p.description ?? ""} |`);
      lines.push("");
    }
    lines.push("Respostas:", "");
    for (const [status, response] of Object.entries(operation.responses))
      lines.push(`- **${status}** — ${response.description ?? "Sem descrição"}`);
    lines.push("");
  }
  if (spec.components?.schemas && Object.keys(spec.components.schemas).length) {
    lines.push("## Modelos", "");
    for (const [name, schema] of Object.entries(spec.components.schemas)) {
      lines.push(`### ${name}`, "", schema.description ?? "", "", "```json",
        JSON.stringify(schema, null, 2), "```", "");
    }
  }
  return `${lines.join("\n")}\n`;
}
