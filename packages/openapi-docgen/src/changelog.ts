import { methods, type HttpMethod, type OpenApi, type Operation, type Schema } from "./spec.js";

export interface ChangelogEntry { section: string; message: string; }

function endpointKey(path: string, method: HttpMethod): string {
  return `${method.toUpperCase()} ${path}`;
}

function diffParameters(before: Operation, after: Operation, key: string): ChangelogEntry[] {
  const entries: ChangelogEntry[] = [];
  const beforeParams = new Map((before.parameters ?? []).map((p) => [`${p.in}:${p.name}`, p]));
  const afterParams = new Map((after.parameters ?? []).map((p) => [`${p.in}:${p.name}`, p]));
  for (const [id, param] of afterParams) {
    if (!beforeParams.has(id)) entries.push({ section: "Parâmetros adicionados", message: `\`${key}\`: parâmetro \`${param.name}\` (${param.in}) adicionado${param.required ? " (obrigatório)" : ""}` });
  }
  for (const [id, param] of beforeParams) {
    if (!afterParams.has(id)) entries.push({ section: "Parâmetros removidos", message: `\`${key}\`: parâmetro \`${param.name}\` (${param.in}) removido` });
  }
  for (const [id, beforeParam] of beforeParams) {
    const afterParam = afterParams.get(id);
    if (!afterParam) continue;
    if (Boolean(beforeParam.required) !== Boolean(afterParam.required))
      entries.push({ section: "Parâmetros alterados", message: `\`${key}\`: parâmetro \`${afterParam.name}\` obrigatoriedade mudou de ${beforeParam.required ? "sim" : "não"} para ${afterParam.required ? "sim" : "não"}` });
    if (beforeParam.schema?.type !== afterParam.schema?.type)
      entries.push({ section: "Parâmetros alterados", message: `\`${key}\`: parâmetro \`${afterParam.name}\` tipo mudou de \`${beforeParam.schema?.type ?? "desconhecido"}\` para \`${afterParam.schema?.type ?? "desconhecido"}\`` });
  }
  return entries;
}

function diffSchemas(before: Record<string, Schema> | undefined, after: Record<string, Schema> | undefined): ChangelogEntry[] {
  const entries: ChangelogEntry[] = [];
  const beforeSchemas = before ?? {};
  const afterSchemas = after ?? {};
  for (const name of Object.keys(afterSchemas)) {
    if (!(name in beforeSchemas)) entries.push({ section: "Schemas adicionados", message: `\`${name}\` adicionado` });
  }
  for (const name of Object.keys(beforeSchemas)) {
    if (!(name in afterSchemas)) entries.push({ section: "Schemas removidos", message: `\`${name}\` removido` });
  }
  for (const name of Object.keys(beforeSchemas)) {
    const beforeSchema = beforeSchemas[name];
    const afterSchema = afterSchemas[name];
    if (!beforeSchema || !afterSchema) continue;
    const beforeProps = beforeSchema.properties ?? {};
    const afterProps = afterSchema.properties ?? {};
    for (const field of Object.keys(afterProps)) {
      if (!(field in beforeProps)) entries.push({ section: "Schemas alterados", message: `\`${name}.${field}\` adicionado` });
    }
    for (const field of Object.keys(beforeProps)) {
      if (!(field in afterProps)) entries.push({ section: "Schemas alterados", message: `\`${name}.${field}\` removido` });
    }
    for (const field of Object.keys(beforeProps)) {
      const beforeField = beforeProps[field];
      const afterField = afterProps[field];
      if (!beforeField || !afterField) continue;
      if (beforeField.type !== afterField.type)
        entries.push({ section: "Schemas alterados", message: `\`${name}.${field}\` tipo mudou de \`${beforeField.type ?? "desconhecido"}\` para \`${afterField.type ?? "desconhecido"}\`` });
    }
    const beforeRequired = new Set(beforeSchema.required ?? []);
    const afterRequired = new Set(afterSchema.required ?? []);
    for (const field of afterRequired) {
      if (!beforeRequired.has(field)) entries.push({ section: "Schemas alterados", message: `\`${name}.${field}\` tornou-se obrigatório` });
    }
    for (const field of beforeRequired) {
      if (!afterRequired.has(field)) entries.push({ section: "Schemas alterados", message: `\`${name}.${field}\` deixou de ser obrigatório` });
    }
  }
  return entries;
}

export function diffSpecs(before: OpenApi, after: OpenApi): ChangelogEntry[] {
  const entries: ChangelogEntry[] = [];
  const beforePaths = before.paths ?? {};
  const afterPaths = after.paths ?? {};
  const allPaths = new Set([...Object.keys(beforePaths), ...Object.keys(afterPaths)]);
  for (const path of allPaths) {
    for (const method of methods) {
      const beforeOp = beforePaths[path]?.[method];
      const afterOp = afterPaths[path]?.[method];
      const key = endpointKey(path, method);
      if (!beforeOp && afterOp) entries.push({ section: "Endpoints adicionados", message: `\`${key}\`` });
      else if (beforeOp && !afterOp) entries.push({ section: "Endpoints removidos", message: `\`${key}\`` });
      else if (beforeOp && afterOp) entries.push(...diffParameters(beforeOp, afterOp, key));
    }
  }
  entries.push(...diffSchemas(before.components?.schemas, after.components?.schemas));
  return entries;
}

export function generateChangelog(before: OpenApi, after: OpenApi): string {
  const entries = diffSpecs(before, after);
  const lines = [`# Changelog`, "", `\`${before.info.version}\` → \`${after.info.version}\``, ""];
  const order = ["Endpoints adicionados", "Endpoints removidos", "Parâmetros adicionados", "Parâmetros removidos",
    "Parâmetros alterados", "Schemas adicionados", "Schemas removidos", "Schemas alterados"];
  let any = false;
  for (const section of order) {
    const sectionEntries = entries.filter((e) => e.section === section);
    if (!sectionEntries.length) continue;
    any = true;
    lines.push(`## ${section}`, "");
    for (const entry of sectionEntries) lines.push(`- ${entry.message}`);
    lines.push("");
  }
  if (!any) lines.push("Nenhuma alteração estrutural detectada.", "");
  return `${lines.join("\n")}\n`;
}
