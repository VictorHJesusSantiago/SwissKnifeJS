import { describe, expect, it } from "vitest";
import { formatTable, printJson } from "../packages/core/src/output.js";
import { loadPlugins } from "../packages/core/src/plugins.js";
import { checkToolHealth } from "../packages/core/src/health.js";
import { TOOLS, findTool } from "../packages/cli/src/tools.js";

describe("core output", () => {
  it("formata tabela com colunas alinhadas", () => {
    const table = formatTable([{ nome: "a", valor: "1" }, { nome: "bb", valor: "22" }]);
    expect(table).toContain("nome");
    expect(table).toContain("valor");
  });

  it("printJson não lança erro", () => {
    expect(() => printJson({ ok: true })).not.toThrow();
  });
});

describe("core plugins", () => {
  it("retorna lista vazia quando diretório não existe", async () => {
    const plugins = await loadPlugins("./__inexistente__");
    expect(plugins).toEqual([]);
  });
});

describe("core health", () => {
  it("reporta down para URL inválida", async () => {
    const result = await checkToolHealth({ name: "x", url: "http://127.0.0.1:1", timeoutMs: 300 });
    expect(result.status).toBe("down");
  });
});

describe("cli tools registry", () => {
  it("contém todas as ferramentas do monorepo", () => {
    expect(TOOLS.length).toBeGreaterThanOrEqual(12);
  });

  it("encontra ferramenta por nome", () => {
    expect(findTool("faq-bot")?.script).toContain("faq-bot");
    expect(findTool("inexistente")).toBeUndefined();
  });
});
