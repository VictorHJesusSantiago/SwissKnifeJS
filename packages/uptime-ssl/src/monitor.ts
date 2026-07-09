import { connect } from "node:tls";

export interface Target {
  name: string;
  url: string;
  timeoutMs?: number;
  expectedStatus?: number[];
  sslWarningDays?: number;
  headers?: Record<string, string>;
}

export interface CheckResult {
  name: string;
  url: string;
  ok: boolean;
  status?: number;
  latencyMs: number;
  checkedAt: string;
  certificate?: { validTo: string; daysRemaining: number; issuer?: string };
  error?: string;
}

export async function checkTarget(target: Target): Promise<CheckResult> {
  const started = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), target.timeoutMs ?? 10_000);
  try {
    const response = await fetch(target.url, {
      headers: target.headers,
      redirect: "follow",
      signal: controller.signal
    });
    const accepted = target.expectedStatus ?? [200, 201, 202, 204, 301, 302];
    const certificate = target.url.startsWith("https:") ? await inspectCertificate(new URL(target.url)) : undefined;
    const sslOk = !certificate || certificate.daysRemaining >= (target.sslWarningDays ?? 14);
    return {
      name: target.name, url: target.url,
      ok: accepted.includes(response.status) && sslOk,
      status: response.status, latencyMs: Math.round(performance.now() - started),
      checkedAt: new Date().toISOString(), certificate
    };
  } catch (error) {
    return {
      name: target.name, url: target.url, ok: false,
      latencyMs: Math.round(performance.now() - started),
      checkedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error)
    };
  } finally {
    clearTimeout(timer);
  }
}

export function inspectCertificate(url: URL): Promise<CheckResult["certificate"]> {
  return new Promise((resolve, reject) => {
    const socket = connect({ host: url.hostname, port: Number(url.port || 443), servername: url.hostname }, () => {
      const cert = socket.getPeerCertificate();
      socket.end();
      if (!cert.valid_to) return reject(new Error("Certificado TLS não encontrado"));
      const daysRemaining = Math.floor((new Date(cert.valid_to).getTime() - Date.now()) / 86_400_000);
      const rawIssuer = cert.issuer?.O;
      resolve({
        validTo: new Date(cert.valid_to).toISOString(),
        daysRemaining,
        issuer: Array.isArray(rawIssuer) ? rawIssuer.join(", ") : rawIssuer
      });
    });
    socket.setTimeout(10_000, () => socket.destroy(new Error("Timeout ao consultar TLS")));
    socket.once("error", reject);
  });
}

export async function notify(webhook: string, results: CheckResult[]): Promise<void> {
  const failed = results.filter((result) => !result.ok);
  if (!failed.length) return;
  const text = failed.map((r) => `❌ ${r.name}: ${r.error ?? `HTTP ${r.status}`} (${r.latencyMs}ms)`).join("\n");
  const response = await fetch(webhook, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ text })
  });
  if (!response.ok) throw new Error(`Webhook respondeu ${response.status}`);
}
