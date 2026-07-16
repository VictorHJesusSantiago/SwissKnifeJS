import { methods, resolveSchema, type OpenApi, type Schema } from "./spec.js";

function pascalCase(name: string): string {
  return name.replace(/(^|[-_ /{}])([a-zA-Z0-9])/g, (_, __, c: string) => c.toUpperCase()).replace(/[^a-zA-Z0-9]/g, "");
}

function schemaToType(raw: Schema | undefined, spec: OpenApi, depth = 0): string {
  const schema = resolveSchema(raw, spec);
  if (!schema || depth > 8) return "unknown";
  if (schema.enum?.length) return schema.enum.map((v) => JSON.stringify(v)).join(" | ");
  if (schema.type === "object" || schema.properties) {
    const props = Object.entries(schema.properties ?? {});
    if (!props.length) return "Record<string, unknown>";
    const required = new Set(schema.required ?? []);
    const fields = props.map(([key, value]) => `${key}${required.has(key) ? "" : "?"}: ${schemaToType(value, spec, depth + 1)};`);
    return `{ ${fields.join(" ")} }`;
  }
  if (schema.type === "array") return `Array<${schemaToType(schema.items, spec, depth + 1)}>`;
  if (schema.type === "integer" || schema.type === "number") return "number";
  if (schema.type === "boolean") return "boolean";
  if (schema.type === "string") return "string";
  return "unknown";
}

export function generateTypeScriptSdk(spec: OpenApi): string {
  const lines: string[] = [
    "// Gerado automaticamente por @swissknife/openapi-docgen — não edite manualmente.",
    "",
  ];

  for (const [name, schema] of Object.entries(spec.components?.schemas ?? {})) {
    lines.push(`export interface ${pascalCase(name)} ${schemaToType(schema, spec)}`, "");
  }

  const baseUrl = spec.servers?.[0]?.url ?? "";
  lines.push(
    "export interface RequestOptions { baseUrl?: string; headers?: Record<string, string>; fetch?: typeof fetch; }",
    "",
    `const DEFAULT_BASE_URL = ${JSON.stringify(baseUrl)};`,
    "",
    "async function request<T>(method: string, path: string, body: unknown, options: RequestOptions = {}): Promise<T> {",
    "  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;",
    "  const doFetch = options.fetch ?? fetch;",
    "  const response = await doFetch(`${baseUrl}${path}`, {",
    "    method,",
    "    headers: { ...(body !== undefined ? { \"Content-Type\": \"application/json\" } : {}), ...options.headers },",
    "    body: body !== undefined ? JSON.stringify(body) : undefined,",
    "  });",
    "  if (!response.ok) throw new Error(`Falha na requisição ${method} ${path}: ${response.status}`);",
    "  const text = await response.text();",
    "  return (text ? JSON.parse(text) : undefined) as T;",
    "}",
    "",
  );

  let anonymousIndex = 0;
  for (const [path, item] of Object.entries(spec.paths)) {
    for (const method of methods) {
      const operation = item[method];
      if (!operation) continue;
      anonymousIndex += 1;
      const functionName = operation.operationId ?? `${method}${pascalCase(path)}${anonymousIndex}`;
      const pathParams = (operation.parameters ?? []).filter((p) => p.in === "path");
      const queryParams = (operation.parameters ?? []).filter((p) => p.in === "query");
      const jsonBody = operation.requestBody?.content?.["application/json"];
      const responseSchema = operation.responses["200"]?.content?.["application/json"]?.schema
        ?? operation.responses["201"]?.content?.["application/json"]?.schema;
      const returnType = responseSchema ? schemaToType(responseSchema, spec) : "unknown";

      const args: string[] = [];
      for (const param of pathParams) args.push(`${param.name}: ${schemaToType(param.schema, spec)}`);
      for (const param of queryParams) args.push(`${param.name}${param.required ? "" : "?"}: ${schemaToType(param.schema, spec)}`);
      if (jsonBody) args.push(`body: ${schemaToType(jsonBody.schema, spec)}`);
      args.push("options?: RequestOptions");

      let resolvedPath = path.replace(/\{([^}]+)\}/g, (_, name: string) => `\${${name}}`);
      if (queryParams.length) {
        const queryExpr = queryParams
          .map((p) => `${JSON.stringify(p.name)}=\${encodeURIComponent(String(${p.name}))}`)
          .join("&");
        resolvedPath += `?${queryExpr}`;
      }

      lines.push(
        `export async function ${functionName}(${args.join(", ")}): Promise<${returnType}> {`,
        `  return request<${returnType}>(${JSON.stringify(method.toUpperCase())}, \`${resolvedPath}\`, ${jsonBody ? "body" : "undefined"}, options);`,
        "}",
        "",
      );
    }
  }

  return `${lines.join("\n")}\n`;
}
