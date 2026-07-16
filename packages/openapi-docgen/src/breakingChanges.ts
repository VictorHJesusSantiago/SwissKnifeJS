import { methods, resolveSchema, type OpenApi, type Operation } from "./spec.js";

export type BumpLevel = "major" | "minor" | "patch";

export interface BreakingChange { breaking: boolean; message: string; }

function requestJsonSchema(operation: Operation | undefined, spec: OpenApi) {
  const schema = operation?.requestBody?.content?.["application/json"]?.schema;
  return resolveSchema(schema, spec);
}

function responseJsonSchema(operation: Operation | undefined, spec: OpenApi, status: string) {
  const schema = operation?.responses?.[status]?.content?.["application/json"]?.schema;
  return resolveSchema(schema, spec);
}

export function findBreakingChanges(before: OpenApi, after: OpenApi): BreakingChange[] {
  const changes: BreakingChange[] = [];
  const beforePaths = before.paths ?? {};
  const afterPaths = after.paths ?? {};
  for (const [path, item] of Object.entries(beforePaths)) {
    for (const method of methods) {
      const beforeOp = item[method];
      if (!beforeOp) continue;
      const key = `${method.toUpperCase()} ${path}`;
      const afterOp = afterPaths[path]?.[method];
      if (!afterOp) {
        changes.push({ breaking: true, message: `Endpoint removido: ${key}` });
        continue;
      }

      const beforeRequestSchema = requestJsonSchema(beforeOp, before);
      const afterRequestSchema = requestJsonSchema(afterOp, after);
      const afterRequestRequired = new Set(afterRequestSchema?.required ?? []);
      const beforeRequestRequired = new Set(beforeRequestSchema?.required ?? []);
      for (const field of afterRequestRequired) {
        if (!beforeRequestRequired.has(field))
          changes.push({ breaking: true, message: `${key}: campo obrigatório \`${field}\` adicionado ao request` });
      }
      const beforeRequestProps = beforeRequestSchema?.properties ?? {};
      const afterRequestProps = afterRequestSchema?.properties ?? {};
      for (const field of Object.keys(beforeRequestProps)) {
        const beforeType = beforeRequestProps[field]?.type;
        const afterType = afterRequestProps[field]?.type;
        if (afterType && beforeType && beforeType !== afterType)
          changes.push({ breaking: true, message: `${key}: tipo do campo \`${field}\` do request mudou de \`${beforeType}\` para \`${afterType}\`` });
      }

      for (const status of Object.keys(beforeOp.responses ?? {})) {
        const beforeResponseSchema = responseJsonSchema(beforeOp, before, status);
        const afterResponseSchema = responseJsonSchema(afterOp, after, status);
        if (!beforeResponseSchema) continue;
        const beforeResponseProps = beforeResponseSchema.properties ?? {};
        const afterResponseProps = afterResponseSchema?.properties ?? {};
        const beforeResponseRequired = new Set(beforeResponseSchema.required ?? []);
        for (const field of beforeResponseRequired) {
          if (!afterResponseSchema || !(field in afterResponseProps))
            changes.push({ breaking: true, message: `${key}: campo obrigatório \`${field}\` removido da response ${status}` });
        }
        for (const field of Object.keys(beforeResponseProps)) {
          const beforeType = beforeResponseProps[field]?.type;
          const afterType = afterResponseProps[field]?.type;
          if (afterType && beforeType && beforeType !== afterType)
            changes.push({ breaking: true, message: `${key}: tipo do campo \`${field}\` da response ${status} mudou de \`${beforeType}\` para \`${afterType}\`` });
        }
      }
    }
  }
  return changes;
}

export function suggestBump(before: OpenApi, after: OpenApi): BumpLevel {
  if (findBreakingChanges(before, after).length > 0) return "major";
  const beforeText = JSON.stringify(before.paths) + JSON.stringify(before.components?.schemas ?? {});
  const afterText = JSON.stringify(after.paths) + JSON.stringify(after.components?.schemas ?? {});
  return beforeText === afterText ? "patch" : "minor";
}
