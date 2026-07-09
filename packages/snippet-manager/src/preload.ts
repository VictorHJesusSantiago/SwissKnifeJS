import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("snippets", {
  list: () => ipcRenderer.invoke("snippets:list"),
  save: (value: unknown) => ipcRenderer.invoke("snippets:save", value),
  remove: (id: string) => ipcRenderer.invoke("snippets:remove", id),
  copy: (code: string) => ipcRenderer.invoke("snippets:copy", code)
});
