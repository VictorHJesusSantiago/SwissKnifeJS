import { methods, sampleFromSchema, type OpenApi } from "./spec.js";

interface InsomniaResource {
  _id: string;
  _type: "workspace" | "request";
  parentId: string | null;
  name: string;
  url?: string;
  method?: string;
  headers?: Array<{ name: string; value: string }>;
  parameters?: Array<{ name: string; value: string }>;
  body?: { mimeType: string; text: string };
}

export interface InsomniaExport {
  _type: "export";
  __export_format: 4;
  __export_source: string;
  resources: InsomniaResource[];
}

export function exportInsomniaCollection(spec: OpenApi): InsomniaExport {
  const baseUrl = spec.servers?.[0]?.url ?? "http://localhost";
  const workspaceId = "wrk_1";
  const resources: InsomniaResource[] = [
    { _id: workspaceId, _type: "workspace", parentId: null, name: spec.info.title },
  ];
  let index = 0;
  for (const [path, item] of Object.entries(spec.paths)) {
    for (const method of methods) {
      const operation = item[method];
      if (!operation) continue;
      index += 1;
      const resolvedPath = path.replace(/\{([^}]+)\}/g, (_, name: string) => {
        const param = operation.parameters?.find((p) => p.name === name && p.in === "path");
        return String(param ? sampleFromSchema(param.schema, spec) ?? name : name);
      });
      const headers = (operation.parameters ?? [])
        .filter((p) => p.in === "header")
        .map((p) => ({ name: p.name, value: String(sampleFromSchema(p.schema, spec) ?? "") }));
      const jsonBody = operation.requestBody?.content?.["application/json"];
      if (jsonBody) headers.push({ name: "Content-Type", value: "application/json" });
      resources.push({
        _id: `req_${index}`,
        _type: "request",
        parentId: workspaceId,
        name: operation.operationId ?? `${method.toUpperCase()} ${path}`,
        method: method.toUpperCase(),
        url: `${baseUrl}${resolvedPath}`,
        headers,
        parameters: (operation.parameters ?? [])
          .filter((p) => p.in === "query")
          .map((p) => ({ name: p.name, value: String(sampleFromSchema(p.schema, spec) ?? "") })),
        ...(jsonBody ? { body: { mimeType: "application/json", text: JSON.stringify(sampleFromSchema(jsonBody.schema, spec), null, 2) } } : {}),
      });
    }
  }
  return { _type: "export", __export_format: 4, __export_source: "openapi-docgen", resources };
}
