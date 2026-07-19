import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { LogStore } from "../packages/log-aggregator/src/store.js";
import { parseLogLine, parseLogLines, detectFormat } from "../packages/log-aggregator/src/logParsers.js";
import { AlertEngine } from "../packages/log-aggregator/src/alerting.js";
import { rotateIfNeeded } from "../packages/log-aggregator/src/rotation.js";
import { parseQuery, runQuery } from "../packages/log-aggregator/src/queryDsl.js";
import { SavedQueryStore } from "../packages/log-aggregator/src/savedQueries.js";

describe("logParsers", () => {
  it("detecta e faz parse de uma linha JSON", () => {
    const parsed = parseLogLine('{"level":"error","service":"api","message":"falhou","timestamp":"2024-01-01T00:00:00Z"}');
    expect(parsed.format).toBe("json");
    expect(parsed.level).toBe("error");
    expect(parsed.service).toBe("api");
    expect(parsed.message).toBe("falhou");
  });

  it("faz parse de syslog RFC5424", () => {
    const line = "<34>1 2024-01-01T00:00:00Z myhost app 1234 ID47 - falha crítica no serviço";
    const parsed = parseLogLine(line);
    expect(parsed.format).toBe("syslog5424");
    expect(parsed.service).toBe("app");
    expect(parsed.level).toBe("error");
  });

  it("faz parse de syslog RFC3164", () => {
    const line = "<13>Jan 12 06:30:00 myhost sshd[1234]: sessão aberta para usuário root";
    const parsed = parseLogLine(line);
    expect(parsed.format).toBe("syslog3164");
    expect(parsed.service).toBe("sshd");
  });

  it("faz parse de Apache/Nginx combined log format", () => {
    const line = '127.0.0.1 - frank [10/Oct/2023:13:55:36 -0700] "GET /apache_pb.gif HTTP/1.0" 500 2326 "http://ref" "Mozilla/5.0"';
    const parsed = parseLogLine(line);
    expect(parsed.format).toBe("apacheCombined");
    expect(parsed.level).toBe("error");
    expect(parsed.fields.status).toBe(500);
  });

  it("faz parse de Apache/Nginx common log format", () => {
    const line = '127.0.0.1 - frank [10/Oct/2023:13:55:36 -0700] "GET /index.html HTTP/1.0" 200 2326';
    const parsed = parseLogLine(line);
    expect(parsed.format).toBe("apacheCommon");
    expect(parsed.level).toBe("info");
  });

  it("detecta o formato dominante em um conjunto de linhas", () => {
    const lines = [
      '{"level":"info","service":"a","message":"x"}',
      '{"level":"info","service":"a","message":"y"}',
      "linha sem formato reconhecido"
    ];
    expect(detectFormat(lines)).toBe("json");
    expect(parseLogLines(lines.join("\n"))).toHaveLength(3);
  });
});

describe("AlertEngine", () => {
  it("dispara alerta de console quando threshold é atingido na janela", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sk-alerts-"));
    const engine = new AlertEngine(join(dir, "rules.json"));
    await engine.load();
    await engine.addRule({
      name: "erros repetidos", pattern: "timeout", matchType: "substring",
      threshold: 2, windowMs: 60_000, target: { type: "console" }
    });
    const base: import("../packages/log-aggregator/src/store.js").LogEntry = {
      id: "1", timestamp: new Date().toISOString(), level: "error", service: "api", message: "timeout ao conectar"
    };
    const first = await engine.evaluate(base);
    expect(first).toHaveLength(0);
    const second = await engine.evaluate({ ...base, id: "2" });
    expect(second).toHaveLength(1);
    expect(second[0]!.matchCount).toBe(2);
  });

  it("dispara alerta em arquivo quando target é file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sk-alerts-file-"));
    const alertFile = join(dir, "alerts.ndjson");
    const engine = new AlertEngine(join(dir, "rules.json"));
    await engine.load();
    await engine.addRule({
      name: "regex-rule", pattern: "^ERROR", matchType: "regex",
      threshold: 1, windowMs: 60_000, target: { type: "file", path: alertFile }
    });
    await engine.evaluate({
      id: "1", timestamp: new Date().toISOString(), level: "error", service: "api", message: "ERROR falha grave"
    });
    const content = await readFile(alertFile, "utf8");
    expect(content).toContain("regex-rule");
  });

  it("persiste e recarrega regras", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sk-alerts-persist-"));
    const rulesFile = join(dir, "rules.json");
    const engine = new AlertEngine(rulesFile);
    await engine.load();
    await engine.addRule({ name: "r1", pattern: "x", matchType: "substring", threshold: 1, windowMs: 1000, target: { type: "console" } });
    const reloaded = new AlertEngine(rulesFile);
    await reloaded.load();
    expect(reloaded.listRules()).toHaveLength(1);
  });
});

describe("rotation", () => {
  it("rotaciona e compacta quando o tamanho excede o limite", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sk-rotation-"));
    const file = join(dir, "logs.ndjson");
    await writeFile(file, "a".repeat(2048), "utf8");
    const result = await rotateIfNeeded(file, { maxSizeBytes: 1024, maxAgeMs: Number.MAX_SAFE_INTEGER, archiveDir: join(dir, "archive") });
    expect(result.rotated).toBe(true);
    expect(result.archivePath).toBeDefined();
    const active = await readFile(file, "utf8");
    expect(active).toBe("");
  });

  it("não rotaciona quando abaixo dos limites", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sk-rotation-none-"));
    const file = join(dir, "logs.ndjson");
    await writeFile(file, "pequeno", "utf8");
    const result = await rotateIfNeeded(file, { maxSizeBytes: 1024 * 1024, maxAgeMs: 24 * 60 * 60 * 1000 });
    expect(result.rotated).toBe(false);
  });

  it("remove arquivos compactados excedentes respeitando maxArchives", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sk-rotation-prune-"));
    const file = join(dir, "logs.ndjson");
    const archiveDir = join(dir, "archive");
    for (let i = 0; i < 3; i++) {
      await writeFile(file, "conteudo".repeat(200), "utf8");
      await rotateIfNeeded(file, { maxSizeBytes: 10, maxAgeMs: Number.MAX_SAFE_INTEGER, archiveDir, maxArchives: 1 });
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    const { readdir } = await import("node:fs/promises");
    const files = (await readdir(archiveDir)).filter((f) => f.endsWith(".gz"));
    expect(files.length).toBeLessThanOrEqual(1);
  });
});

describe("queryDsl", () => {
  const entries: import("../packages/log-aggregator/src/store.js").LogEntry[] = [
    { id: "1", timestamp: "2024-01-01T00:00:00Z", level: "error", service: "api", message: "timeout no banco" },
    { id: "2", timestamp: "2024-01-02T00:00:00Z", level: "info", service: "web", message: "requisição concluída" },
    { id: "3", timestamp: "2024-01-03T00:00:00Z", level: "warn", service: "api", message: "latência alta detectada" }
  ];

  it("filtra por campo:valor", () => {
    expect(runQuery("service:api", entries)).toHaveLength(2);
  });

  it("suporta AND entre termos", () => {
    expect(runQuery("service:api AND level:error", entries)).toHaveLength(1);
  });

  it("suporta OR entre termos", () => {
    expect(runQuery("level:error OR level:warn", entries)).toHaveLength(2);
  });

  it("suporta frase exata entre aspas", () => {
    expect(runQuery('"latência alta"', entries)).toHaveLength(1);
  });

  it("suporta wildcards em valores de campo", () => {
    expect(runQuery("service:a*", entries)).toHaveLength(2);
  });

  it("suporta negação com -", () => {
    expect(runQuery("-level:info", entries)).toHaveLength(2);
  });

  it("suporta faixas de tempo", () => {
    const result = runQuery("timestamp:[2024-01-02T00:00:00Z TO 2024-01-03T23:59:59Z]", entries);
    expect(result.map((e) => e.id)).toEqual(["2", "3"]);
  });

  it("expõe parseQuery reutilizável", () => {
    const parsed = parseQuery("service:web");
    expect(entries.filter((e) => parsed.evaluate(e))).toHaveLength(1);
  });
});

describe("SavedQueryStore", () => {
  it("salva, lista e remove queries nomeadas", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sk-saved-queries-"));
    const store = new SavedQueryStore(join(dir, "saved.json"));
    const saved = await store.save({ name: "erros-api", query: "service:api AND level:error" });
    expect((await store.list())).toHaveLength(1);
    expect(await store.get("erros-api")).toMatchObject({ query: "service:api AND level:error" });
    expect(await store.remove(saved.id)).toBe(true);
    expect(await store.list()).toHaveLength(0);
  });

  it("sobrescreve query existente com mesmo nome", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sk-saved-queries-overwrite-"));
    const store = new SavedQueryStore(join(dir, "saved.json"));
    await store.save({ name: "q1", query: "a:b" });
    await store.save({ name: "q1", query: "c:d" });
    const all = await store.list();
    expect(all).toHaveLength(1);
    expect(all[0]!.query).toBe("c:d");
  });
});

describe("integração store + alertas + query", () => {
  it("ingere logs, avalia alertas e busca via DSL", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sk-integration-"));
    const store = new LogStore(join(dir, "logs.ndjson"));
    await store.ingest({ level: "error", service: "api", message: "timeout crítico" });
    await store.ingest({ level: "info", service: "web", message: "ok" });
    const all = await store.query({ limit: 100 });
    expect(runQuery("level:error", all)).toHaveLength(1);
  });
});
