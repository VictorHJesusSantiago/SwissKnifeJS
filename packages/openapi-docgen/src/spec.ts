import { readFile } from "node:fs/promises";
import YAML from "yaml";

export interface Schema {
  type?: string; format?: string; example?: unknown; default?: unknown;
  enum?: unknown[]; properties?: Record<string, Schema>; required?: string[];
  items?: Schema; $ref?: string; description?: string;
}
export interface Operation {
  summary?: string; description?: string; operationId?: string; tags?: string[];
  parameters?: Array<{ name: string; in: string; required?: boolean; schema?: Schema; description?: string }>;
  requestBody?: { required?: boolean; content?: Record<string, { schema?: Schema; example?: unknown }> };
  responses: Record<string, { description?: string; content?: Record<string, { schema?: Schema; example?: unknown }> }>;
}
export interface OpenApi {
  openapi: string; info: { title: string; version: string; description?: string };
  servers?: Array<{ url: string }>;
  paths: Record<string, Partial<Record<HttpMethod, Operation>>>;
  components?: { schemas?: Record<string, Schema> };
}
export type HttpMethod = "get" | "post" | "put" | "patch" | "delete" | "head" | "options";
export const methods: HttpMethod[] = ["get", "post", "put", "patch", "delete", "head", "options"];

export async function loadSpec(path: string): Promise<OpenApi> {
  const text = await readFile(path, "utf8");
  const data = path.endsWith(".json") ? JSON.parse(text) : YAML.parse(text);
  const errors = validateSpec(data);
  if (errors.length) throw new Error(`OpenAPI inválido:\n- ${errors.join("\n- ")}`);
  return data as OpenApi;
}

export function validateSpec(value: unknown): string[] {
  const errors: string[] = [];
  if (!value || typeof value !== "object") return ["Documento deve ser um objeto"];
  const spec = value as Partial<OpenApi>;
  if (!spec.openapi?.startsWith("3.")) errors.push("openapi deve usar a versão 3.x");
  if (!spec.info?.title) errors.push("info.title é obrigatório");
  if (!spec.info?.version) errors.push("info.version é obrigatório");
  if (!spec.paths || typeof spec.paths !== "object") errors.push("paths é obrigatório");
  else for (const [path, item] of Object.entries(spec.paths)) {
    if (!path.startsWith("/")) errors.push(`Caminho ${path} deve iniciar com /`);
    for (const method of methods) {
      const operation = item[method];
      if (operation && !operation.responses) errors.push(`${method.toUpperCase()} ${path} não possui responses`);
    }
  }
  return errors;
}

export function resolveSchema(schema: Schema | undefined, spec: OpenApi): Schema | undefined {
  if (!schema?.$ref) return schema;
  const prefix = "#/components/schemas/";
  return schema.$ref.startsWith(prefix) ? spec.components?.schemas?.[schema.$ref.slice(prefix.length)] : undefined;
}

export function sampleFromSchema(raw: Schema | undefined, spec: OpenApi, depth = 0): unknown {
  const schema = resolveSchema(raw, spec);
  if (!schema || depth > 8) return null;
  if (schema.example !== undefined) return schema.example;
  if (schema.default !== undefined) return schema.default;
  if (schema.enum?.length) return schema.enum[0];
  if (schema.type === "object" || schema.properties) return Object.fromEntries(
    Object.entries(schema.properties ?? {}).map(([key, child]) => [key, sampleFromSchema(child, spec, depth + 1)])
  );
  if (schema.type === "array") return [sampleFromSchema(schema.items, spec, depth + 1)];
  if (schema.type === "integer" || schema.type === "number") return 0;
  if (schema.type === "boolean") return false;
  if (schema.format === "date-time") return new Date(0).toISOString();
  if (schema.format === "date") return "1970-01-01";
  return "string";
}
