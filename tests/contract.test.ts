import { describe, expect, it } from "vitest";
import { validateValue } from "../packages/contract-tester/src/validator.js";
import type { OpenApi } from "../packages/openapi-docgen/src/spec.js";
const spec = { openapi: "3.0.0", info: { title: "x", version: "1" }, paths: {} } as OpenApi;
describe("contrato", () => {
  it("detecta propriedade ausente", () => {
    expect(validateValue({}, { type: "object", required: ["id"], properties: { id: { type: "number" } } }, spec))
      .toContain("$.id é obrigatório");
  });
});
