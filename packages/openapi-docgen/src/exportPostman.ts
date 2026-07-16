import { methods, sampleFromSchema, type OpenApi } from "./spec.js";

export interface PostmanCollection {
  info: { name: string; description?: string; schema: string };
  item: Array<{
    name: string;
    request: {
      method: string;
      header: Array<{ key: string; value: string }>;
      url: { raw: string; host: string[]; path: string[]; query?: Array<{ key: string; value: string }> };
      body?: { mode: "raw"; raw: string; options: { raw: { language: "json" } } };
    };
  }>;
}

function toPostmanUrl(baseUrl: string, path: string, query: Array<{ key: string; value: string }>) {
  const raw = `${baseUrl}${path}${query.length ? `?${query.map((q) => `${q.key}=${q.value}`).join("&")}` : ""}`;
  const host = baseUrl.replace(/^https?:\/\//, "").split("/").filter(Boolean);
  const pathSegments = path.split("/").filter(Boolean);
  return { raw, host, path: pathSegments, ...(query.length ? { query } : {}) };
}

export function exportPostmanCollection(spec: OpenApi): PostmanCollection {
  const baseUrl = spec.servers?.[0]?.url ?? "http://localhost";
  const items: PostmanCollection["item"] = [];
  for (const [path, item] of Object.entries(spec.paths)) {
    for (const method of methods) {
      const operation = item[method];
      if (!operation) continue;
      const query = (operation.parameters ?? [])
        .filter((p) => p.in === "query")
        .map((p) => ({ key: p.name, value: String(sampleFromSchema(p.schema, spec) ?? "") }));
      const header = [
        ...(operation.parameters ?? [])
          .filter((p) => p.in === "header")
          .map((p) => ({ key: p.name, value: String(sampleFromSchema(p.schema, spec) ?? "") })),
      ];
      const jsonBody = operation.requestBody?.content?.["application/json"];
      if (jsonBody) header.push({ key: "Content-Type", value: "application/json" });
      const resolvedPath = path.replace(/\{([^}]+)\}/g, (_, name: string) => {
        const param = operation.parameters?.find((p) => p.name === name && p.in === "path");
        return String(param ? sampleFromSchema(param.schema, spec) ?? name : name);
      });
      items.push({
        name: operation.operationId ?? `${method.toUpperCase()} ${path}`,
        request: {
          method: method.toUpperCase(),
          header,
          url: toPostmanUrl(baseUrl, resolvedPath, query),
          ...(jsonBody ? { body: { mode: "raw" as const, raw: JSON.stringify(sampleFromSchema(jsonBody.schema, spec), null, 2), options: { raw: { language: "json" as const } } } } : {}),
        },
      });
    }
  }
  return { info: { name: spec.info.title, description: spec.info.description, schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json" }, item: items };
}
