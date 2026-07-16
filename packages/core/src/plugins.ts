import { readdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { join } from "node:path";

export interface Plugin {
  name: string;
  description?: string;
  run: (argv: string[]) => void | Promise<void>;
}

export interface PluginModule {
  plugin: Plugin;
}

export async function loadPlugins(directory: string): Promise<Plugin[]> {
  let entries: string[];
  try {
    entries = await readdir(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const plugins: Plugin[] = [];
  for (const entry of entries) {
    if (!entry.endsWith(".js") && !entry.endsWith(".mjs") && !entry.endsWith(".ts")) continue;
    const moduleUrl = pathToFileURL(join(directory, entry)).href;
    const imported = (await import(moduleUrl)) as Partial<PluginModule>;
    if (imported.plugin && typeof imported.plugin.run === "function") plugins.push(imported.plugin);
  }
  return plugins;
}

export async function runPlugin(directory: string, name: string, argv: string[]): Promise<boolean> {
  const plugins = await loadPlugins(directory);
  const plugin = plugins.find((candidate) => candidate.name === name);
  if (!plugin) return false;
  await plugin.run(argv);
  return true;
}
