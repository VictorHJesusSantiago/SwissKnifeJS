import { writeFile } from "node:fs/promises";
import { parseArgs, stringArg } from "../../core/src/args.js";
import { readJsonFile } from "../../core/src/io.js";
import { extractActionItems } from "./actionItems.js";
import { exportMarkdown } from "./exportMarkdown.js";
import { markdownToPlainLines, textToPdf } from "./exportPdf.js";
import { fromAzure, fromJira } from "./providers.js";
import { categorizeNotes, resolveTemplate } from "./retroTemplates.js";
import { retrospective } from "./report.js";
import { compareSprints, computeMetrics, loadHistory, recordSprint } from "./sprintComparison.js";

const args = parseArgs(process.argv.slice(2));
const provider = (args._ as string[])[0];
let data;
if (provider === "jira") data = await fromJira(stringArg(args, "url"), stringArg(args, "board"), stringArg(args, "token", process.env.JIRA_TOKEN));
else if (provider === "azure") data = await fromAzure(stringArg(args, "org"), stringArg(args, "project"), stringArg(args, "team"), stringArg(args, "token", process.env.AZURE_DEVOPS_TOKEN));
else throw new Error("Uso: sprint-retro jira --url URL --board ID | azure --org ORG --project PROJ --team TEAM [--notes arquivo.json] [--history historico.json] [--template start-stop-continue|4ls|mad-sad-glad] [--template-notes arquivo.json] [--out RETRO.md] [--pdf | --pdf-out RETRO.pdf]");

const output = stringArg(args, "out", "RETRO.md");

// 1. Action items automáticos a partir de notas/comentários da retro (arquivo JSON com array de strings).
const notesPath = args["notes"] ? stringArg(args, "notes") : undefined;
const notes = notesPath ? await readJsonFile<string[]>(notesPath, []) : [];
const actionItems = extractActionItems(notes);

// 2. Comparação com sprints anteriores usando métricas armazenadas localmente.
const historyPath = args["history"] ? stringArg(args, "history") : undefined;
let comparison;
if (historyPath) {
  const metrics = computeMetrics(data);
  const history = await loadHistory(historyPath);
  comparison = compareSprints(metrics, history);
  await recordSprint(historyPath, metrics);
}

// 4. Template customizável de retro (Start/Stop/Continue, 4Ls, Mad/Sad/Glad).
const templateId = args["template"] ? stringArg(args, "template") : undefined;
let template;
let categorized;
if (templateId) {
  template = resolveTemplate(templateId);
  const templateNotesPath = args["template-notes"] ? stringArg(args, "template-notes") : undefined;
  const notesByCategory = templateNotesPath ? await readJsonFile<Record<string, string[]>>(templateNotesPath, {}) : {};
  categorized = categorizeNotes(template, notesByCategory);
}

const markdown = (actionItems.length || comparison || template)
  ? exportMarkdown({ data, actionItems, comparison, template, categorized })
  : retrospective(data);

await writeFile(output, markdown, "utf8");
console.log(`Retrospectiva gerada em ${output}`);

// 3. Exportação em PDF local, sem dependência de serviço externo.
const pdfRequested = args["pdf"] || args["pdf-out"];
if (pdfRequested) {
  const pdfOut = args["pdf-out"] ? stringArg(args, "pdf-out") : output.replace(/\.md$/i, ".pdf");
  const pdfBuffer = textToPdf(markdownToPlainLines(markdown));
  await writeFile(pdfOut, pdfBuffer);
  console.log(`PDF gerado em ${pdfOut}`);
}
