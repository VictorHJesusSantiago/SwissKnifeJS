import { readFile } from "node:fs/promises";

export type ProviderName = "aws" | "azure" | "gcp";

export interface CloudConfig {
  provider: ProviderName;
  name?: string;
  region?: string;
  [key: string]: unknown;
}

export interface TagDiff {
  added: Record<string, string>;
  removed: Record<string, string>;
  changed: Record<string, { from: string; to: string }>;
}

export interface FieldDiff {
  field: string;
  from: unknown;
  to: unknown;
}

export interface ConfigDiff {
  tags: TagDiff;
  fields: FieldDiff[];
  equivalent: boolean;
}

/** Cada provedor guarda tags/labels sob uma chave e formato diferentes. */
const TAG_KEYS: Record<ProviderName, string> = { aws: "Tags", azure: "Tags", gcp: "labels" };

const COMPARABLE_FIELDS = ["name", "region"] as const;

export function normalizeTags(config: CloudConfig): Record<string, string> {
  const raw = config[TAG_KEYS[config.provider]];
  const tags: Record<string, string> = {};
  if (Array.isArray(raw)) {
    // formato AWS: [{ Key, Value }, ...]
    for (const entry of raw) {
      if (entry && typeof entry === "object" && "Key" in entry && "Value" in entry) {
        tags[String((entry as Record<string, unknown>).Key)] = String((entry as Record<string, unknown>).Value);
      }
    }
  } else if (raw && typeof raw === "object") {
    // formato Azure/GCP: { chave: valor }
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) tags[key] = String(value);
  }
  return tags;
}

export function diffConfigs(a: CloudConfig, b: CloudConfig): ConfigDiff {
  const tagsA = normalizeTags(a);
  const tagsB = normalizeTags(b);
  const added: Record<string, string> = {};
  const removed: Record<string, string> = {};
  const changed: Record<string, { from: string; to: string }> = {};

  for (const [key, value] of Object.entries(tagsB)) {
    if (!(key in tagsA)) added[key] = value;
    else if (tagsA[key] !== value) changed[key] = { from: tagsA[key]!, to: value };
  }
  for (const [key, value] of Object.entries(tagsA)) {
    if (!(key in tagsB)) removed[key] = value;
  }

  const fields: FieldDiff[] = [];
  for (const field of COMPARABLE_FIELDS) {
    if (a[field] !== b[field]) fields.push({ field, from: a[field], to: b[field] });
  }

  const equivalent =
    Object.keys(added).length === 0 &&
    Object.keys(removed).length === 0 &&
    Object.keys(changed).length === 0 &&
    fields.length === 0;

  return { tags: { added, removed, changed }, fields, equivalent };
}

export async function diffConfigFiles(pathA: string, pathB: string): Promise<ConfigDiff> {
  const [rawA, rawB] = await Promise.all([readFile(pathA, "utf8"), readFile(pathB, "utf8")]);
  const a = JSON.parse(rawA) as CloudConfig;
  const b = JSON.parse(rawB) as CloudConfig;
  if (!a.provider || !b.provider) throw new Error("Config precisa informar 'provider' (aws, azure ou gcp)");
  return diffConfigs(a, b);
}
