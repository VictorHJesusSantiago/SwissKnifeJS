import { createServer } from "node:http";
import { json, readBody } from "../../core/src/http.js";
import { readJsonFile, writeJsonAtomic } from "../../core/src/io.js";
import { answerQuestion, type Faq } from "./engine.js";
import { exportFaqMarkdown, importFaqMarkdown } from "./faqMarkdown.js";
import { listUnanswered, promoteUnanswered, recordUnanswered } from "./learning.js";
import { buildReport, recordOutcome } from "./metrics.js";

const port = Number(process.env.PORT ?? 4070);
const faqFile = process.env.FAQ_FILE ?? "examples/faqs.json";
const unansweredFile = process.env.UNANSWERED_FILE ?? "examples/unanswered.json";
const metricsFile = process.env.METRICS_FILE ?? "examples/metrics.json";

let faqs = await readJsonFile<Faq[]>(faqFile, []);

createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://faq-bot");
  try {
    if (request.method === "GET" && url.pathname === "/health") return json(response, 200, { status: "ok" });

    if (request.method === "GET" && url.pathname === "/unanswered") {
      return json(response, 200, await listUnanswered(unansweredFile));
    }

    if (request.method === "POST" && url.pathname === "/unanswered/promote") {
      const raw = await readBody(request);
      const body = JSON.parse(raw.toString()) as { id?: string; faq?: Faq };
      if (!body.id || !body.faq) return json(response, 400, { error: "Campos id e faq obrigatórios" });
      faqs = await promoteUnanswered(unansweredFile, faqFile, body.id, body.faq);
      return json(response, 200, { faqs });
    }

    if (request.method === "GET" && url.pathname === "/export") {
      const markdown = exportFaqMarkdown(faqs);
      response.writeHead(200, { "content-type": "text/markdown; charset=utf-8" });
      return response.end(markdown);
    }

    if (request.method === "POST" && url.pathname === "/import") {
      const raw = await readBody(request);
      const imported = importFaqMarkdown(raw.toString("utf8"));
      if (!imported.length) return json(response, 400, { error: "Nenhuma pergunta encontrada no Markdown" });
      faqs = imported;
      await writeJsonAtomic(faqFile, faqs);
      return json(response, 200, { faqs });
    }

    if (request.method === "GET" && url.pathname === "/metrics") {
      return json(response, 200, await buildReport(metricsFile));
    }

    if (request.method !== "POST" || url.pathname !== "/") return json(response, 404, { error: "Rota não encontrada" });

    const raw = await readBody(request);
    const contentType = request.headers["content-type"] ?? "";
    let text = "";
    let slackResponseUrl: string | undefined;
    if (contentType.includes("application/x-www-form-urlencoded")) {
      const form = new URLSearchParams(raw.toString());
      text = form.get("text") ?? "";
      slackResponseUrl = form.get("response_url") ?? undefined;
    } else {
      const body = JSON.parse(raw.toString()) as { text?: string; value?: { text?: string } };
      text = body.text ?? body.value?.text ?? "";
    }
    if (!text.trim()) return json(response, 400, { error: "Campo text obrigatório" });
    const match = answerQuestion(text, faqs);
    const resolved = match.category !== "triagem";
    await recordOutcome(metricsFile, text, resolved);
    if (!resolved) await recordUnanswered(unansweredFile, text);
    const payload = { text: match.answer, category: match.category, confidence: Number(match.score.toFixed(2)) };
    if (slackResponseUrl) void fetch(slackResponseUrl, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload)
    });
    return json(response, 200, payload);
  } catch (error) {
    return json(response, 400, { error: error instanceof Error ? error.message : String(error) });
  }
}).listen(port, () => console.log(`FAQ bot em http://localhost:${port}`));
