import { randomUUID } from "node:crypto";
import { readJsonFile, writeJsonAtomic } from "../../core/src/io.js";

export interface NetworkPolicyRule {
  direction: "ingress" | "egress";
  allowFrom?: string;
}

export interface NamespaceTemplate {
  id: string;
  name: string;
  description?: string;
  defaultCpu: string;
  defaultMemory: string;
  defaultLimitsCpu: string;
  defaultLimitsMemory: string;
  requiredLabels: string[];
  networkPolicies: NetworkPolicyRule[];
  createdAt: string;
}

export type NamespaceTemplateInput = Omit<NamespaceTemplate, "id" | "createdAt">;

export interface TemplateParams {
  name: string;
  owner: string;
  team: string;
  cpu?: string;
  memory?: string;
  limitsCpu?: string;
  limitsMemory?: string;
  labels?: Record<string, string>;
}

export class TemplateStore {
  constructor(private readonly file: string) {}
  list(): Promise<NamespaceTemplate[]> { return readJsonFile(this.file, []); }
  async get(id: string): Promise<NamespaceTemplate | undefined> {
    return (await this.list()).find((item) => item.id === id);
  }
  async create(input: NamespaceTemplateInput): Promise<NamespaceTemplate> {
    if (!input.name) throw new Error("Nome do template é obrigatório");
    const all = await this.list();
    if (all.some((item) => item.name === input.name)) throw new Error("Template já existe");
    const item: NamespaceTemplate = { ...input, id: randomUUID(), createdAt: new Date().toISOString() };
    await writeJsonAtomic(this.file, [...all, item]);
    return item;
  }
}

export function manifestFromTemplate(template: NamespaceTemplate, params: TemplateParams): string {
  if (!/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(params.name) || params.name.length > 63)
    throw new Error("Nome de namespace inválido");
  const cpu = params.cpu ?? template.defaultCpu;
  const memory = params.memory ?? template.defaultMemory;
  const limitsCpu = params.limitsCpu ?? template.defaultLimitsCpu;
  const limitsMemory = params.limitsMemory ?? template.defaultLimitsMemory;
  const labels: Record<string, string> = {
    "portal.swissknife/team": params.team,
    "portal.swissknife/owner": params.owner,
    ...(params.labels ?? {})
  };
  for (const required of template.requiredLabels) {
    const prefixed = required.startsWith("portal.swissknife/") ? required : `portal.swissknife/${required}`;
    if (!labels[required] && !labels[prefixed]) throw new Error(`Label obrigatória ausente: ${required}`);
  }
  const labelLines = Object.entries(labels).map(([key, value]) => `    ${key}: ${value}`).join("\n");
  const policies = template.networkPolicies.map((policy, index) => `apiVersion: networking.k8s.io/v1\nkind: NetworkPolicy\nmetadata:\n  name: ${template.name}-${policy.direction}-${index}\n  namespace: ${params.name}\nspec:\n  podSelector: {}\n  policyTypes: [${policy.direction === "ingress" ? "Ingress" : "Egress"}]\n  ${policy.direction}:\n  - from:\n    - namespaceSelector:\n        matchLabels:\n          name: ${policy.allowFrom ?? params.name}\n`).join("---\n");
  return [
    `apiVersion: v1\nkind: Namespace\nmetadata:\n  name: ${params.name}\n  labels:\n${labelLines}\n`,
    `apiVersion: v1\nkind: ResourceQuota\nmetadata:\n  name: default-quota\n  namespace: ${params.name}\nspec:\n  hard:\n    requests.cpu: ${cpu}\n    requests.memory: ${memory}\n    limits.cpu: ${limitsCpu}\n    limits.memory: ${limitsMemory}\n`,
    ...(policies ? [policies] : [])
  ].join("---\n");
}
