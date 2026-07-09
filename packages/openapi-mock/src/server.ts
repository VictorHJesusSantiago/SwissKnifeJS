import { createServer, type Server } from "node:http";
import { json, routePath } from "../../core/src/http.js";
import { methods, sampleFromSchema, type OpenApi } from "../../openapi-docgen/src/spec.js";

export function createMockServer(spec: OpenApi): Server {
  return createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://mock");
    for (const [template, item] of Object.entries(spec.paths)) {
      const pattern = template.replace(/\{([^}]+)\}/g, ":$1");
      if (!routePath(pattern, url.pathname)) continue;
      const method = request.method?.toLowerCase();
      if (!methods.includes(method as never)) break;
      const operation = item[method as keyof typeof item];
      if (!operation) break;
      const preferred = request.headers["x-mock-status"]?.toString();
      const statusKey = preferred && operation.responses[preferred]
        ? preferred : Object.keys(operation.responses).find((key) => /^2\d\d$/.test(key)) ?? "default";
      const definition = operation.responses[statusKey];
      if (!definition) return json(response, 500, { error: "Resposta não definida na especificação" });
      const media = definition.content?.["application/json"];
      const body = media?.example ?? sampleFromSchema(media?.schema, spec);
      response.setHeader("x-mock-operation", operation.operationId ?? `${method}-${template}`);
      return json(response, statusKey === "default" ? 200 : Number(statusKey), body);
    }
    return json(response, 404, { error: "Endpoint não definido na especificação" });
  });
}
