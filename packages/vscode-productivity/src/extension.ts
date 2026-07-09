import * as vscode from "vscode";

let timer: NodeJS.Timeout | undefined;
let endsAt = 0;

export function activate(context: vscode.ExtensionContext): void {
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  status.command = "swissknife.stopFocus";
  context.subscriptions.push(status);

  context.subscriptions.push(vscode.commands.registerCommand("swissknife.startFocus", async () => {
    const configured = vscode.workspace.getConfiguration("swissknife").get<number>("focusMinutes", 25);
    const value = await vscode.window.showInputBox({
      title: "Sessão de foco", prompt: "Minutos", value: String(configured),
      validateInput: (raw) => Number(raw) > 0 ? undefined : "Informe um número positivo"
    });
    if (!value) return;
    if (timer) clearInterval(timer);
    endsAt = Date.now() + Number(value) * 60_000;
    status.show();
    const refresh = (): void => {
      const remaining = Math.max(0, endsAt - Date.now());
      status.text = `$(watch) Foco ${Math.ceil(remaining / 60_000)} min`;
      status.tooltip = "Clique para encerrar a sessão";
      if (!remaining) {
        if (timer) clearInterval(timer);
        timer = undefined; status.hide();
        void vscode.window.showInformationMessage("Sessão concluída. Hora de respirar um pouco.");
      }
    };
    refresh();
    timer = setInterval(refresh, 1_000);
  }));

  context.subscriptions.push(vscode.commands.registerCommand("swissknife.stopFocus", () => {
    if (timer) clearInterval(timer);
    timer = undefined; status.hide();
  }));

  context.subscriptions.push(vscode.commands.registerCommand("swissknife.quickNote", async () => {
    const note = await vscode.window.showInputBox({ title: "Nota rápida", prompt: "O que não pode escapar?" });
    if (!note) return;
    const uri = vscode.Uri.joinPath(context.globalStorageUri, "notes.md");
    await vscode.workspace.fs.createDirectory(context.globalStorageUri);
    let previous: Uint8Array<ArrayBufferLike> = new Uint8Array();
    try { previous = await vscode.workspace.fs.readFile(uri); } catch { /* primeira nota */ }
    const line = `- ${new Date().toISOString()} — ${note}\n`;
    await vscode.workspace.fs.writeFile(uri, Buffer.concat([Buffer.from(previous), Buffer.from(line)]));
    const open = await vscode.window.showInformationMessage("Nota salva.", "Abrir notas");
    if (open) await vscode.window.showTextDocument(uri);
  }));
}

export function deactivate(): void {
  if (timer) clearInterval(timer);
}
