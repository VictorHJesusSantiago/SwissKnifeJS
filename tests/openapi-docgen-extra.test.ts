import { describe, expect, it } from "vitest";
import type { OpenApi } from "../packages/openapi-docgen/src/spec.js";
import { diffSpecs, generateChangelog } from "../packages/openapi-docgen/src/changelog.js";
import { findBreakingChanges, suggestBump } from "../packages/openapi-docgen/src/breakingChanges.js";
import { exportPostmanCollection } from "../packages/openapi-docgen/src/exportPostman.js";
import { exportInsomniaCollection } from "../packages/openapi-docgen/src/exportInsomnia.js";
import { generateTypeScriptSdk } from "../packages/openapi-docgen/src/sdkGenerator.js";

const before: OpenApi = {
  openapi: "3.0.3",
  info: { title: "Demo API", version: "1.0.0" },
  servers: [{ url: "https://api.example.com" }],
  paths: {
    "/items": {
      get: {
        operationId: "listItems",
        parameters: [{ name: "limit", in: "query", required: false, schema: { type: "integer" } }],
        responses: { "200": { description: "ok", content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/Item" } } } } } },
      },
      post: {
        operationId: "createItem",
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/ItemInput" } } } },
        responses: { "201": { description: "created", content: { "application/json": { schema: { $ref: "#/components/schemas/Item" } } } } },
      },
    },
    "/items/{id}": {
      get: {
        operationId: "getItem",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "ok", content: { "application/json": { schema: { $ref: "#/components/schemas/Item" } } } } },
      },
      delete: {
        operationId: "deleteItem",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "204": { description: "sem conteúdo" } },
      },
    },
  },
  components: {
    schemas: {
      Item: { type: "object", required: ["id", "name"], properties: { id: { type: "string" }, name: { type: "string" }, price: { type: "number" } } },
      ItemInput: { type: "object", required: ["name"], properties: { name: { type: "string" } } },
    },
  },
};

const afterAdditive: OpenApi = JSON.parse(JSON.stringify(before)) as OpenApi;
afterAdditive.info.version = "1.1.0";
afterAdditive.paths["/items"]!.get!.parameters!.push({ name: "offset", in: "query", required: false, schema: { type: "integer" } });
afterAdditive.components!.schemas!.Item!.properties!.tag = { type: "string" };

const afterBreaking: OpenApi = JSON.parse(JSON.stringify(before)) as OpenApi;
afterBreaking.info.version = "2.0.0";
delete afterBreaking.paths["/items/{id}"]!.delete;
afterBreaking.components!.schemas!.Item!.required = ["id", "name"];
delete afterBreaking.components!.schemas!.Item!.properties!.name;
afterBreaking.components!.schemas!.ItemInput!.required = ["name", "sku"];
afterBreaking.components!.schemas!.ItemInput!.properties!.sku = { type: "string" };

describe("changelog", () => {
  it("detecta endpoint e parâmetro adicionados", () => {
    const entries = diffSpecs(before, afterAdditive);
    expect(entries.some((e) => e.section === "Parâmetros adicionados")).toBe(true);
    expect(entries.some((e) => e.section === "Schemas alterados" && e.message.includes("tag"))).toBe(true);
  });

  it("gera markdown com seções", () => {
    const markdown = generateChangelog(before, afterAdditive);
    expect(markdown).toContain("# Changelog");
    expect(markdown).toContain("1.0.0` → `1.1.0");
  });

  it("informa ausência de mudanças quando specs são iguais", () => {
    expect(generateChangelog(before, before)).toContain("Nenhuma alteração estrutural detectada.");
  });
});

describe("breaking changes", () => {
  it("não detecta breaking change em spec aditiva", () => {
    expect(findBreakingChanges(before, afterAdditive)).toEqual([]);
    expect(suggestBump(before, afterAdditive)).toBe("minor");
  });

  it("detecta remoção de endpoint, campo obrigatório removido de response e campo obrigatório adicionado ao request", () => {
    const changes = findBreakingChanges(before, afterBreaking);
    expect(changes.some((c) => c.message.includes("Endpoint removido") && c.message.includes("DELETE /items/{id}"))).toBe(true);
    expect(changes.some((c) => c.message.includes("removido da response") && c.message.includes("name"))).toBe(true);
    expect(changes.some((c) => c.message.includes("adicionado ao request") && c.message.includes("sku"))).toBe(true);
    expect(suggestBump(before, afterBreaking)).toBe("major");
  });

  it("sugere patch quando nada muda", () => {
    expect(suggestBump(before, before)).toBe("patch");
  });
});

describe("export Postman", () => {
  it("gera coleção v2.1 válida com URLs e bodies", () => {
    const collection = exportPostmanCollection(before);
    expect(collection.info.schema).toContain("v2.1.0");
    expect(collection.item.length).toBe(4);
    const createItem = collection.item.find((i) => i.name === "createItem");
    expect(createItem?.request.body?.mode).toBe("raw");
    const getItem = collection.item.find((i) => i.name === "getItem");
    expect(getItem?.request.url.raw).toContain("/items/");
  });
});

describe("export Insomnia", () => {
  it("gera export v4 com workspace e requests", () => {
    const exported = exportInsomniaCollection(before);
    expect(exported.__export_format).toBe(4);
    const workspace = exported.resources.find((r) => r._type === "workspace");
    expect(workspace).toBeDefined();
    const requests = exported.resources.filter((r) => r._type === "request");
    expect(requests.length).toBe(4);
  });
});

describe("SDK TypeScript", () => {
  it("gera interfaces e funções tipadas por operationId", () => {
    const sdk = generateTypeScriptSdk(before);
    expect(sdk).toContain("export interface Item");
    expect(sdk).toContain("export async function listItems(");
    expect(sdk).toContain("export async function createItem(");
    expect(sdk).toContain("export async function getItem(id: string");
    expect(sdk).toContain("request<");
  });
});
