import { afterEach, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { createMockServer } from "../packages/openapi-mock/src/server.js";
import { fakeFromSchema } from "../packages/openapi-mock/src/fakerGenerator.js";
import type { OpenApi } from "../packages/openapi-docgen/src/spec.js";

const spec: OpenApi = {
  openapi: "3.0.3",
  info: { title: "Faker", version: "1" },
  paths: {
    "/users": {
      get: {
        responses: {
          "200": {
            description: "ok",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    id: { type: "string", format: "uuid" },
                    email: { type: "string", format: "email" },
                    name: { type: "string" },
                    age: { type: "integer" },
                    active: { type: "boolean" }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
};

let server: Server | undefined;
afterEach(() => server?.close());

describe("faker generator", () => {
  it("gera uuid válido para format uuid", () => {
    const value = fakeFromSchema({ type: "string", format: "uuid" }, spec) as string;
    expect(value).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it("gera e-mail válido para format email", () => {
    const value = fakeFromSchema({ type: "string", format: "email" }, spec) as string;
    expect(value).toMatch(/@/);
  });

  it("gera número para type integer", () => {
    const value = fakeFromSchema({ type: "integer" }, spec);
    expect(typeof value).toBe("number");
  });

  it("gera objeto completo respeitando os tipos declarados", () => {
    const value = fakeFromSchema(spec.paths["/users"]!.get!.responses["200"]!.content!["application/json"]!.schema, spec) as Record<string, unknown>;
    expect(typeof value.id).toBe("string");
    expect(typeof value.email).toBe("string");
    expect(typeof value.name).toBe("string");
    expect(typeof value.age).toBe("number");
    expect(typeof value.active).toBe("boolean");
  });

  it("servidor mock usa faker quando a opção está habilitada", async () => {
    server = createMockServer(spec, { faker: true });
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Endereço inválido");
    const response = await fetch(`http://127.0.0.1:${address.port}/users`);
    const body = await response.json();
    expect(body.email).toMatch(/@/);
  });
});
