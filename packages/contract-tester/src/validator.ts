import { methods, resolveSchema, sampleFromSchema, type OpenApi, type Schema } from "../../openapi-docgen/src/spec.js";

export interface ContractFailure { operation: string; message: string }
export interface ContractReport { passed: number; failed: number; failures: ContractFailure[] }

export function validateValue(value: unknown, raw: Schema | undefined, spec: OpenApi, path = "$"): string[] {
  const schema = resolveSchema(raw, spec);
  if (!schema) return [];
  const errors: string[] = [];
  if (schema.type === "object" || schema.properties) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [`${path} deveria ser objeto`];
    for (const required of schema.required ?? []) if (!(required in value)) errors.push(`${path}.${required} é obrigatório`);
    for (const [key, child] of Object.entries(schema.properties ?? {}))
      if (key in value) errors.push(...validateValue((value as Record<string, unknown>)[key], child, spec, `${path}.${key}`));
  } else if (schema.type === "array") {
    if (!Array.isArray(value)) return [`${path} deveria ser array`];
    value.forEach((item, index) => errors.push(...validateValue(item, schema.items, spec, `${path}[${index}]`)));
  } else {
    const expected = schema.type === "integer" ? "number" : schema.type;
    if (expected && typeof value !== expected) errors.push(`${path} deveria ser ${schema.type}`);
    if (schema.enum && !schema.enum.includes(value)) errors.push(`${path} não pertence ao enum`);
  }
  return errors;
}

export async function testContract(spec: OpenApi, baseUrl: string): Promise<ContractReport> {
  const failures: ContractFailure[] = [];
  let passed = 0;
  for (const [path, item] of Object.entries(spec.paths)) for (const method of methods) {
    const operation = item[method];
    if (!operation) continue;
    const operationName = `${method.toUpperCase()} ${path}`;
    const requestPath = path.replace(/\{([^}]+)\}/g, "1");
    const requestMedia = operation.requestBody?.content?.["application/json"];
    const body = requestMedia ? JSON.stringify(requestMedia.example ?? sampleFromSchema(requestMedia.schema, spec)) : undefined;
    try {
      const response = await fetch(new URL(requestPath, baseUrl), {
        method: method.toUpperCase(), headers: body ? { "content-type": "application/json" } : undefined, body
      });
      const definition = operation.responses[String(response.status)] ?? operation.responses.default;
      if (!definition) throw new Error(`status ${response.status} não documentado`);
      const media = definition.content?.["application/json"];
      if (media?.schema) {
        const payload = await response.json();
        const errors = validateValue(payload, media.schema, spec);
        if (errors.length) throw new Error(errors.join("; "));
      }
      passed += 1;
    } catch (error) {
      failures.push({ operation: operationName, message: error instanceof Error ? error.message : String(error) });
    }
  }
  return { passed, failed: failures.length, failures };
}
