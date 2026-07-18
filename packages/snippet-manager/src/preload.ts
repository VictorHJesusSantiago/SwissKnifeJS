import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("snippets", {
  list: () => ipcRenderer.invoke("snippets:list"),
  save: (value: unknown) => ipcRenderer.invoke("snippets:save", value),
  remove: (id: string) => ipcRenderer.invoke("snippets:remove", id),
  copy: (code: string) => ipcRenderer.invoke("snippets:copy", code),
  search: (options: unknown) => ipcRenderer.invoke("snippets:search", options),
  tags: () => ipcRenderer.invoke("snippets:tags"),
  categories: () => ipcRenderer.invoke("snippets:categories"),
  syncGetPath: () => ipcRenderer.invoke("sync:getPath"),
  syncChoosePath: () => ipcRenderer.invoke("sync:choosePath"),
  syncSetPath: (path: string | undefined) => ipcRenderer.invoke("sync:setPath", path),
  syncNow: () => ipcRenderer.invoke("sync:now"),
  exportSnippets: (format: "json" | "yaml") => ipcRenderer.invoke("io:export", format),
  importSnippets: () => ipcRenderer.invoke("io:import"),
  historyList: (snippetId: string) => ipcRenderer.invoke("history:list", snippetId),
  historyDiff: (versionId: string, snippetId: string) => ipcRenderer.invoke("history:diff", versionId, snippetId),
  historyRestore: (versionId: string) => ipcRenderer.invoke("history:restore", versionId)
});
