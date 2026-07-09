import { app, BrowserWindow, clipboard, ipcMain } from "electron";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SnippetStore, type Snippet } from "./store.js";
const here = dirname(fileURLToPath(import.meta.url));
let store: SnippetStore;
app.whenReady().then(() => {
  store = new SnippetStore(join(app.getPath("userData"), "snippets.json"));
  const window = new BrowserWindow({
    width: 1050, height: 720, minWidth: 760, minHeight: 500,
    webPreferences: { preload: join(here, "preload.js"), contextIsolation: true, nodeIntegration: false }
  });
  void window.loadFile(join(here, "../renderer/index.html"));
});
ipcMain.handle("snippets:list", () => store.list());
ipcMain.handle("snippets:save", (_event, value: Omit<Snippet, "id" | "updatedAt"> & { id?: string }) => store.save(value));
ipcMain.handle("snippets:remove", (_event, id: string) => store.remove(id));
ipcMain.handle("snippets:copy", (_event, code: string) => clipboard.writeText(code));
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
