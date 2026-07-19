import * as vscode from "vscode";

// ---------- Pomodoro / Focus timer state ----------
let timer: NodeJS.Timeout | undefined;
let endsAt = 0;
let paused = false;
let remainingOnPause = 0;
let currentPhase: "focus" | "shortBreak" | "longBreak" | undefined;
let currentPhaseMinutes = 0;
let cyclesCompleted = 0;

interface FocusSession {
  date: string; // ISO
  durationMinutes: number;
  phase: "focus";
}

interface TaskItem {
  id: string;
  text: string;
  done: boolean;
}

function phaseLabel(phase: "focus" | "shortBreak" | "longBreak"): string {
  if (phase === "focus") return "Foco";
  if (phase === "shortBreak") return "Pausa curta";
  return "Pausa longa";
}

function phaseIcon(phase: "focus" | "shortBreak" | "longBreak"): string {
  if (phase === "focus") return "$(watch)";
  return "$(coffee)";
}

async function readJson<T>(uri: vscode.Uri, fallback: T): Promise<T> {
  try {
    const raw = await vscode.workspace.fs.readFile(uri);
    return JSON.parse(Buffer.from(raw).toString("utf8")) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(context: vscode.ExtensionContext, uri: vscode.Uri, data: unknown): Promise<void> {
  await vscode.workspace.fs.createDirectory(context.globalStorageUri);
  await vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify(data, null, 2), "utf8"));
}

export function activate(context: vscode.ExtensionContext): void {
  const sessionsUri = vscode.Uri.joinPath(context.globalStorageUri, "focus-sessions.json");
  const tasksUri = vscode.Uri.joinPath(context.globalStorageUri, "tasks.json");

  // ---------- Pomodoro status bar ----------
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  status.command = "swissknife.stopFocus";
  context.subscriptions.push(status);

  // ---------- Pending tasks status bar ----------
  const tasksStatus = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
  tasksStatus.command = "swissknife.manageTasks";
  context.subscriptions.push(tasksStatus);

  const refreshTasksStatus = async (): Promise<void> => {
    const tasks = await readJson<TaskItem[]>(tasksUri, []);
    const pending = tasks.filter((t) => !t.done).length;
    tasksStatus.text = `$(checklist) ${pending} pendente${pending === 1 ? "" : "s"}`;
    tasksStatus.tooltip = "Clique para gerenciar tarefas do dia";
    tasksStatus.show();
  };
  void refreshTasksStatus();

  const config = () => vscode.workspace.getConfiguration("swissknife");

  const saveFocusSession = async (durationMinutes: number): Promise<void> => {
    const sessions = await readJson<FocusSession[]>(sessionsUri, []);
    sessions.push({ date: new Date().toISOString(), durationMinutes, phase: "focus" });
    await writeJson(context, sessionsUri, sessions);
  };

  const stopAll = (): void => {
    if (timer) clearInterval(timer);
    timer = undefined;
    paused = false;
    remainingOnPause = 0;
    currentPhase = undefined;
    currentPhaseMinutes = 0;
    status.hide();
  };

  const startPhase = (phase: "focus" | "shortBreak" | "longBreak", minutes: number, remainingMs?: number): void => {
    if (timer) clearInterval(timer);
    currentPhase = phase;
    currentPhaseMinutes = minutes;
    paused = false;
    endsAt = Date.now() + (remainingMs ?? minutes * 60_000);
    status.show();
    const refresh = (): void => {
      const remaining = Math.max(0, endsAt - Date.now());
      status.text = `${phaseIcon(phase)} ${phaseLabel(phase)} ${Math.ceil(remaining / 60_000)} min`;
      status.tooltip = "Clique para encerrar a sessão pomodoro";
      if (!remaining) {
        if (timer) clearInterval(timer);
        timer = undefined;
        void onPhaseComplete(phase, minutes);
      }
    };
    refresh();
    timer = setInterval(refresh, 1_000);
  };

  const onPhaseComplete = async (phase: "focus" | "shortBreak" | "longBreak", minutes: number): Promise<void> => {
    if (phase === "focus") {
      cyclesCompleted += 1;
      await saveFocusSession(minutes);
      const sessionsBeforeLongBreak = config().get<number>("sessionsBeforeLongBreak", 4);
      const isLongBreak = cyclesCompleted % sessionsBeforeLongBreak === 0;
      const nextMinutes = isLongBreak
        ? config().get<number>("longBreakMinutes", 15)
        : config().get<number>("shortBreakMinutes", 5);
      void vscode.window.showInformationMessage(
        `Sessão de foco concluída (${minutes} min). Hora da ${isLongBreak ? "pausa longa" : "pausa curta"}.`
      );
      startPhase(isLongBreak ? "longBreak" : "shortBreak", nextMinutes);
    } else {
      void vscode.window.showInformationMessage("Pausa concluída. De volta ao foco?", "Iniciar foco").then((choice) => {
        if (choice) void vscode.commands.executeCommand("swissknife.startFocus");
      });
      stopAll();
    }
  };

  context.subscriptions.push(vscode.commands.registerCommand("swissknife.startFocus", async () => {
    const configured = config().get<number>("focusMinutes", 25);
    const value = await vscode.window.showInputBox({
      title: "Sessão de foco", prompt: "Minutos", value: String(configured),
      validateInput: (raw) => Number(raw) > 0 ? undefined : "Informe um número positivo"
    });
    if (!value) return;
    cyclesCompleted = 0;
    startPhase("focus", Number(value));
  }));

  context.subscriptions.push(vscode.commands.registerCommand("swissknife.pauseFocus", () => {
    if (!timer || !currentPhase) return;
    if (!paused) {
      remainingOnPause = Math.max(0, endsAt - Date.now());
      clearInterval(timer);
      timer = undefined;
      paused = true;
      status.text = `$(debug-pause) ${phaseLabel(currentPhase)} pausado`;
      status.tooltip = "Clique em 'Retomar foco' para continuar";
    } else {
      startPhase(currentPhase, currentPhaseMinutes, remainingOnPause);
    }
  }));

  context.subscriptions.push(vscode.commands.registerCommand("swissknife.stopFocus", () => {
    stopAll();
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

  // ---------- Focus session history / weekly report ----------
  context.subscriptions.push(vscode.commands.registerCommand("swissknife.weeklyFocusReport", async () => {
    const sessions = await readJson<FocusSession[]>(sessionsUri, []);
    const now = Date.now();
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
    const recent = sessions.filter((s) => new Date(s.date).getTime() >= weekAgo);
    const totalMinutes = recent.reduce((sum, s) => sum + s.durationMinutes, 0);
    const byDay = new Map<string, number>();
    for (const s of recent) {
      const day = s.date.slice(0, 10);
      byDay.set(day, (byDay.get(day) ?? 0) + s.durationMinutes);
    }
    const rows = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b));

    const panel = vscode.window.createWebviewPanel(
      "swissknifeWeeklyReport",
      "SwissKnife: Relatório semanal de foco",
      vscode.ViewColumn.Active,
      {}
    );
    const rowsHtml = rows.length
      ? rows.map(([day, minutes]) => `<tr><td>${day}</td><td>${minutes} min</td></tr>`).join("")
      : `<tr><td colspan="2">Nenhuma sessão nos últimos 7 dias.</td></tr>`;
    panel.webview.html = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8">
<style>
  body { font-family: var(--vscode-font-family, sans-serif); padding: 1rem; }
  table { border-collapse: collapse; width: 100%; }
  th, td { text-align: left; padding: 0.4rem 0.8rem; border-bottom: 1px solid rgba(128,128,128,0.3); }
  h1 { font-size: 1.2rem; }
  .summary { margin-bottom: 1rem; }
</style></head>
<body>
  <h1>Relatório semanal de foco</h1>
  <p class="summary"><strong>Total:</strong> ${totalMinutes} min em ${recent.length} sessão(ões) — últimos 7 dias.</p>
  <table>
    <thead><tr><th>Dia</th><th>Minutos em foco</th></tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>
</body></html>`;
  }));

  // ---------- Quick snippets ----------
  const insertSnippet = async (text: string): Promise<void> => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      void vscode.window.showWarningMessage("Abra um editor de texto para inserir o snippet.");
      return;
    }
    await editor.insertSnippet(new vscode.SnippetString(text));
  };

  const defaultSnippets = config().get<Record<string, string>>("snippets", {
    todo: "// TODO: $1",
    consoleLog: "console.log($1);",
    tryCatch: "try {\n\t$1\n} catch (error) {\n\t$2\n}",
    functionDoc: "/**\n * $1\n */\n"
  });

  const snippetCommandIds = ["swissknife.insertSnippetTodo", "swissknife.insertSnippetConsoleLog", "swissknife.insertSnippetTryCatch", "swissknife.insertSnippetFunctionDoc"];
  const snippetKeys = ["todo", "consoleLog", "tryCatch", "functionDoc"];
  snippetCommandIds.forEach((commandId, index) => {
    context.subscriptions.push(vscode.commands.registerCommand(commandId, async () => {
      const snippets = config().get<Record<string, string>>("snippets", defaultSnippets);
      const key = snippetKeys[index] as string;
      const text = snippets[key] ?? defaultSnippets[key] ?? "";
      await insertSnippet(text);
    }));
  });

  context.subscriptions.push(vscode.commands.registerCommand("swissknife.insertSnippet", async () => {
    const snippets = config().get<Record<string, string>>("snippets", defaultSnippets);
    const pick = await vscode.window.showQuickPick(Object.keys(snippets), { title: "Escolha um snippet" });
    if (!pick) return;
    await insertSnippet(snippets[pick] ?? "");
  }));

  // ---------- Pending tasks management ----------
  context.subscriptions.push(vscode.commands.registerCommand("swissknife.manageTasks", async () => {
    const tasks = await readJson<TaskItem[]>(tasksUri, []);
    const ADD = "$(add) Adicionar nova tarefa…";
    const items = [ADD, ...tasks.map((t) => `${t.done ? "$(check)" : "$(circle-large-outline)"} ${t.text}`)];
    const pick = await vscode.window.showQuickPick(items, { title: "Tarefas do dia" });
    if (!pick) return;
    if (pick === ADD) {
      const text = await vscode.window.showInputBox({ title: "Nova tarefa", prompt: "Descreva a tarefa" });
      if (!text) return;
      tasks.push({ id: `${Date.now()}`, text, done: false });
      await writeJson(context, tasksUri, tasks);
      await refreshTasksStatus();
      void vscode.commands.executeCommand("swissknife.manageTasks");
      return;
    }
    const index = items.indexOf(pick) - 1;
    const task = tasks[index];
    if (!task) return;
    const action = await vscode.window.showQuickPick(
      [task.done ? "Marcar como pendente" : "Marcar como concluída", "Remover tarefa"],
      { title: task.text }
    );
    if (!action) return;
    if (action === "Remover tarefa") {
      tasks.splice(index, 1);
    } else {
      task.done = !task.done;
    }
    await writeJson(context, tasksUri, tasks);
    await refreshTasksStatus();
  }));
}

export function deactivate(): void {
  if (timer) clearInterval(timer);
}
