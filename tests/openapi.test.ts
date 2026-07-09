import { describe, expect, it } from "vitest";
import { sampleFromSchema, validateSpec, type OpenApi } from "../packages/openapi-docgen/src/spec.js";
import { generateMarkdown } from "../packages/openapi-docgen/src/generator.js";
const spec: OpenApi = {
  openapi: "3.0.3", info: { title: "Demo", version: "1" },
  paths: { "/items": { get: { responses: { "200": { description: "ok" } } } } },
  components: { schemas: { Item: { type: "object", required: ["id"], properties: { id: { type: "integer" } } } } }
};
describe("OpenAPI", () => {
  it("valida documento", () => expect(validateSpec(spec)).toEqual([]));
  it("gera amostra por ref", () => expect(sampleFromSchema({ $ref: "#/components/schemas/Item" }, spec)).toEqual({ id: 0 }));
  it("gera documentação", () => expect(generateMarkdown(spec)).toContain("GET `/items`"));
});
