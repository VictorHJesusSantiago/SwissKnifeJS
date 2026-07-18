import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { json, routePath } from "../../core/src/http.js";
import { methods, sampleFromSchema, type OpenApi } from "../../openapi-docgen/src/spec.js";
import { chaosKey, evaluateChaos, findChaosRule, wait, type ChaosConfig } from "./chaos.js";
import { fakeFromSchema } from "./fakerGenerator.js";
import type { MockScenario } from "./recorder.js";

export type MockHandler = (request: IncomingMessage, response: ServerResponse) => void;

export interface MockServerOptions {
  /** Regras de latência/erro simulados por rota (chaos testing leve). */
  chaos?: ChaosConfig;
  /** Usa @faker-js/faker para gerar dados mais realistas em vez das amostras neutras padrão. */
  faker?: boolean;
  /** Cenários pré-gravados (via recorder) que têm prioridade sobre a especificação. */
  scenarios?: MockScenario[];
}

function findScenario(scenarios: MockScenario[] | undefined, method: string, pathname: string): MockScenario | undefined {
  if (!scenarios) return undefined;
  return scenarios.find((scenario) => scenario.method === method.toUpperCase() && scenario.path === pathname);
}

export function createMockHandler(spec: OpenApi, options: MockServerOptions = {}): MockHandler {
  return (request, response) => {
    void handleMockRequest(spec, options, request, response);
  };
}

async function handleMockRequest(
  spec: OpenApi,
  options: MockServerOptions,
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  const url = new URL(request.url ?? "/", "http://mock");
  const method = (request.method ?? "GET").toLowerCase();

  const scenario = findScenario(options.scenarios, method, url.pathname);
  if (scenario) {
    return json(response, scenario.status, scenario.body);
  }

  for (const [template, item] of Object.entries(spec.paths)) {
    const pattern = template.replace(/\{([^}]+)\}/g, ":$1");
    if (!routePath(pattern, url.pathname)) continue;
    if (!methods.includes(method as never)) break;
    const operation = item[method as keyof typeof item];
    if (!operation) break;

    const rule = findChaosRule(options.chaos, method, template);
    const outcome = evaluateChaos(rule);
    if (outcome.delayMs > 0) await wait(outcome.delayMs);
    if (outcome.forcedStatus !== undefined) {
      response.setHeader("x-mock-chaos", chaosKey(method, template));
      return json(response, outcome.forcedStatus, outcome.forcedBody ?? { error: "Erro simulado (chaos)" });
    }

    const preferred = request.headers["x-mock-status"]?.toString();
    const statusKey = preferred && operation.responses[preferred]
      ? preferred : Object.keys(operation.responses).find((key) => /^2\d\d$/.test(key)) ?? "default";
    const definition = operation.responses[statusKey];
    if (!definition) return json(response, 500, { error: "Resposta não definida na especificação" });
    const media = definition.content?.["application/json"];
    const body = media?.example ?? (options.faker ? fakeFromSchema(media?.schema, spec) : sampleFromSchema(media?.schema, spec));
    response.setHeader("x-mock-operation", operation.operationId ?? `${method}-${template}`);
    return json(response, statusKey === "default" ? 200 : Number(statusKey), body);
  }
  return json(response, 404, { error: "Endpoint não definido na especificação" });
}

export function createMockServer(spec: OpenApi, options: MockServerOptions = {}): Server {
  return createServer(createMockHandler(spec, options));
}
