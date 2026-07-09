import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readJsonFile, writeJsonAtomic } from "../../core/src/io.js";

export interface NamespaceRequest {
  id: string; name: string; owner: string; team: string; cpu: string; memory: string;
  status: "pending" | "approved" | "rejected" | "applied"; createdAt: string; reason?: string;
}

export class NamespaceStore {
  constructor(private readonly file: string) {}
  list(): Promise<NamespaceRequest[]> { return readJsonFile(this.file, []); }
  async create(input: Omit<NamespaceRequest, "id" | "status" | "createdAt">): Promise<NamespaceRequest> {
    if (!/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(input.name) || input.name.length > 63)
      throw new Error("Nome de namespace inválido");
    const all = await this.list();
    if (all.some((item) => item.name === input.name && item.status !== "rejected")) throw new Error("Namespace já solicitado");
    const item: NamespaceRequest = { ...input, id: randomUUID(), status: "pending", createdAt: new Date().toISOString() };
    await writeJsonAtomic(this.file, [...all, item]);
    return item;
  }
  async update(id: string, status: NamespaceRequest["status"], reason?: string): Promise<NamespaceRequest> {
    const all = await this.list();
    const item = all.find((entry) => entry.id === id);
    if (!item) throw new Error("Solicitação não encontrada");
    item.status = status; item.reason = reason;
    await writeJsonAtomic(this.file, all);
    return item;
  }
}

export function manifest(item: NamespaceRequest): string {
  const labels = `    portal.swissknife/team: ${item.team}\n    portal.swissknife/owner: ${item.owner}`;
  return `apiVersion: v1\nkind: Namespace\nmetadata:\n  name: ${item.name}\n  labels:\n${labels}\n---\napiVersion: v1\nkind: ResourceQuota\nmetadata:\n  name: default-quota\n  namespace: ${item.name}\nspec:\n  hard:\n    requests.cpu: ${item.cpu}\n    requests.memory: ${item.memory}\n    limits.cpu: ${item.cpu}\n    limits.memory: ${item.memory}\n`;
}

export function applyManifest(yaml: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("kubectl", ["apply", "-f", "-"], { stdio: ["pipe", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => stderr += chunk);
    child.once("error", reject);
    child.once("close", (code) => code === 0 ? resolve() : reject(new Error(stderr || `kubectl terminou com ${code}`)));
    child.stdin.end(yaml);
  });
}
