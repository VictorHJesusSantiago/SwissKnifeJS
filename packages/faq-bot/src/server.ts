import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { json, readBody } from "../../core/src/http.js";
import { answerQuestion, type Faq } from "./engine.js";

const port = Number(process.env.PORT ?? 4070);
const faqs = JSON.parse(await readFile(process.env.FAQ_FILE ?? "examples/faqs.json", "utf8")) as Faq[];

createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/health") return json(response, 200, { status: "ok" });
  if (request.method !== "POST") return json(response, 404, { error: "Rota não encontrada" });
  try {
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
    const payload = { text: match.answer, category: match.category, confidence: Number(match.score.toFixed(2)) };
    if (slackResponseUrl) void fetch(slackResponseUrl, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload)
    });
    return json(response, 200, payload);
  } catch (error) {
    return json(response, 400, { error: error instanceof Error ? error.message : String(error) });
  }
}).listen(port, () => console.log(`FAQ bot em http://localhost:${port}`));
