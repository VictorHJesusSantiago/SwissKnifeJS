import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import type { LogEntry } from "./store.js";

export interface AlertRule {
  id: string;
  name: string;
  /** regex (string) ou substring, dependendo de `matchType` */
  pattern: string;
  matchType: "regex" | "substring";
  /** número de ocorrências necessárias dentro da janela para disparar */
  threshold: number;
  /** duração da janela deslizante em milissegundos */
  windowMs: number;
  /** destino da notificação */
  target: { type: "webhook"; url: string } | { type: "file"; path: string } | { type: "console" };
  enabled?: boolean;
}

export interface AlertEvent {
  id: string;
  ruleId: string;
  ruleName: string;
  timestamp: string;
  matchCount: number;
  windowMs: number;
  sampleEntries: LogEntry[];
}

type Notifier = (event: AlertEvent, rule: AlertRule) => Promise<void>;

/** Motor de alertas: mantém regras, avalia entradas de log e dispara notificações locais. */
export class AlertEngine {
  private readonly rules: Map<string, AlertRule> = new Map();
  private readonly hits: Map<string, number[]> = new Map();

  constructor(
    private readonly rulesFile: string,
    private readonly notifier: Notifier = defaultNotifier
  ) {}

  async load(): Promise<void> {
    let text = "";
    try {
      text = await readFile(this.rulesFile, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      return;
    }
    const rules = JSON.parse(text || "[]") as AlertRule[];
    this.rules.clear();
    for (const rule of rules) this.rules.set(rule.id, rule);
  }

  private async persist(): Promise<void> {
    await mkdir(dirname(this.rulesFile), { recursive: true });
    await writeFile(this.rulesFile, JSON.stringify([...this.rules.values()], null, 2), "utf8");
  }

  async addRule(input: Omit<AlertRule, "id">): Promise<AlertRule> {
    if (!input.name || !input.pattern) throw new Error("name e pattern são obrigatórios");
    if (input.threshold < 1) throw new Error("threshold deve ser >= 1");
    if (input.matchType === "regex") {
      try {
        new RegExp(input.pattern);
      } catch {
        throw new Error("regex inválida em pattern");
      }
    }
    const rule: AlertRule = { ...input, id: randomUUID(), enabled: input.enabled ?? true };
    this.rules.set(rule.id, rule);
    await this.persist();
    return rule;
  }

  async removeRule(id: string): Promise<boolean> {
    const removed = this.rules.delete(id);
    this.hits.delete(id);
    if (removed) await this.persist();
    return removed;
  }

  listRules(): AlertRule[] {
    return [...this.rules.values()];
  }

  private matches(rule: AlertRule, entry: LogEntry): boolean {
    const haystack = `${entry.message} ${JSON.stringify(entry.metadata ?? {})}`;
    if (rule.matchType === "substring") return haystack.toLowerCase().includes(rule.pattern.toLowerCase());
    return new RegExp(rule.pattern).test(haystack);
  }

  /** Avalia uma entrada recém-ingerida contra todas as regras ativas, disparando alertas quando necessário. */
  async evaluate(entry: LogEntry): Promise<AlertEvent[]> {
    const now = Date.parse(entry.timestamp) || Date.now();
    const fired: AlertEvent[] = [];
    for (const rule of this.rules.values()) {
      if (rule.enabled === false) continue;
      if (!this.matches(rule, entry)) continue;
      const timestamps = (this.hits.get(rule.id) ?? []).filter((t) => now - t <= rule.windowMs);
      timestamps.push(now);
      this.hits.set(rule.id, timestamps);
      if (timestamps.length >= rule.threshold) {
        const event: AlertEvent = {
          id: randomUUID(),
          ruleId: rule.id,
          ruleName: rule.name,
          timestamp: new Date(now).toISOString(),
          matchCount: timestamps.length,
          windowMs: rule.windowMs,
          sampleEntries: [entry]
        };
        this.hits.set(rule.id, []);
        await this.notifier(event, rule);
        fired.push(event);
      }
    }
    return fired;
  }
}

async function defaultNotifier(event: AlertEvent, rule: AlertRule): Promise<void> {
  const target = rule.target;
  if (target.type === "console") {
    console.log(`[alert] ${event.ruleName}: ${event.matchCount} ocorrências em ${event.windowMs}ms`);
    return;
  }
  if (target.type === "file") {
    await mkdir(dirname(target.path), { recursive: true });
    await appendFile(target.path, `${JSON.stringify(event)}\n`, "utf8");
    return;
  }
  if (target.type === "webhook") {
    const response = await fetch(target.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: `Alerta "${event.ruleName}": ${event.matchCount} ocorrências`, event })
    });
    if (!response.ok) throw new Error(`Webhook respondeu ${response.status}`);
  }
}
