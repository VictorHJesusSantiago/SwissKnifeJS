import { app, BrowserWindow, clipboard, dialog, ipcMain } from "electron";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SnippetStore, type Snippet } from "./store.js";
import { SearchIndex, type SearchOptions } from "./search.js";
import { SyncManager } from "./sync.js";
import { exportSnippets, importSnippets, type ExportFormat } from "./importExport.js";
import { VersionHistoryStore } from "./versionHistory.js";

const here = dirname(fileURLToPath(import.meta.url));
let store: SnippetStore;
let history: VersionHistoryStore;
let sync: SyncManager;
const searchIndex = new SearchIndex();
let mainWindow: BrowserWindow;

async function refreshIndex(): Promise<void> {
  searchIndex.reindex(await store.list());
}

app.whenReady().then(async () => {
  store = new SnippetStore(join(app.getPath("userData"), "snippets.json"));
  history = new VersionHistoryStore(join(app.getPath("userData"), "snippet-history.json"));
  sync = new SyncManager(undefined);
  await refreshIndex();
  mainWindow = new BrowserWindow({
    width: 1050, height: 720, minWidth: 760, minHeight: 500,
    webPreferences: { preload: join(here, "preload.js"), contextIsolation: true, nodeIntegration: false }
  });
  void mainWindow.loadFile(join(here, "../renderer/index.html"));
});

ipcMain.handle("snippets:list", () => store.list());

ipcMain.handle("snippets:save", async (_event, value: Omit<Snippet, "id" | "updatedAt"> & { id?: string }) => {
  if (value.id) {
    const previous = await store.get(value.id);
    if (previous) await history.recordPrevious(previous);
  }
  const saved = await store.save(value);
  await refreshIndex();
  return saved;
});

ipcMain.handle("snippets:remove", async (_event, id: string) => {
  await store.remove(id);
  await refreshIndex();
});

ipcMain.handle("snippets:copy", (_event, code: string) => clipboard.writeText(code));

// --- Search / tags / categories ---
ipcMain.handle("snippets:search", (_event, options: SearchOptions) => searchIndex.search(options));
ipcMain.handle("snippets:tags", () => searchIndex.allTags());
ipcMain.handle("snippets:categories", () => searchIndex.allCategories());

// --- Sync ---
ipcMain.handle("sync:getPath", () => sync.getPath());
ipcMain.handle("sync:choosePath", async () => {
  const result = await dialog.showOpenDialog(mainWindow, { properties: ["openFile", "createDirectory"], filters: [{ name: "Sync JSON", extensions: ["json"] }] });
  if (result.canceled || result.filePaths.length === 0) return sync.getPath();
  sync.setPath(result.filePaths[0]);
  return sync.getPath();
});
ipcMain.handle("sync:setPath", (_event, path: string | undefined) => { sync.setPath(path); return sync.getPath(); });
ipcMain.handle("sync:now", async () => {
  const local = await store.list();
  const merged = await sync.syncNow(local);
  await store.replaceAll(merged);
  await refreshIndex();
  return merged;
});

// --- Import / Export ---
ipcMain.handle("io:export", async (_event, format: ExportFormat) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: format === "yaml" ? "snippets.yaml" : "snippets.json",
    filters: [{ name: format === "yaml" ? "YAML" : "JSON", extensions: [format === "yaml" ? "yaml" : "json"] }]
  });
  if (result.canceled || !result.filePath) return false;
  await exportSnippets(result.filePath, await store.list(), format);
  return true;
});
ipcMain.handle("io:import", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile"],
    filters: [{ name: "Snippets", extensions: ["json", "yaml", "yml"] }]
  });
  if (result.canceled || result.filePaths.length === 0) return 0;
  const imported = await importSnippets(result.filePaths[0]!);
  for (const snippet of imported) await store.save(snippet);
  await refreshIndex();
  return imported.length;
});

// --- Version history ---
ipcMain.handle("history:list", (_event, snippetId: string) => history.forSnippet(snippetId));
ipcMain.handle("history:diff", async (_event, versionId: string, snippetId: string) => {
  const version = await history.get(versionId);
  const current = await store.get(snippetId);
  if (!version || !current) return [];
  return VersionHistoryStore.diffLines(version.code, current.code);
});
ipcMain.handle("history:restore", async (_event, versionId: string) => {
  const version = await history.get(versionId);
  if (!version) throw new Error("Versão não encontrada");
  const current = await store.get(version.snippetId);
  if (current) await history.recordPrevious(current);
  const restored = await store.save({ id: version.snippetId, title: version.title, language: version.language, code: version.code, tags: version.tags, category: version.category });
  await refreshIndex();
  return restored;
});

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
