export interface ToolHealthCheck {
  name: string;
  url: string;
  timeoutMs?: number;
}

export interface ToolHealthResult {
  name: string;
  url: string;
  status: "up" | "down";
  latencyMs?: number;
  error?: string;
}

export async function checkToolHealth(check: ToolHealthCheck): Promise<ToolHealthResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), check.timeoutMs ?? 2000);
  const started = Date.now();
  try {
    const response = await fetch(check.url, { signal: controller.signal });
    const latencyMs = Date.now() - started;
    return response.ok
      ? { name: check.name, url: check.url, status: "up", latencyMs }
      : { name: check.name, url: check.url, status: "down", latencyMs, error: `HTTP ${response.status}` };
  } catch (error) {
    return { name: check.name, url: check.url, status: "down", error: (error as Error).message };
  } finally {
    clearTimeout(timeout);
  }
}

export async function checkAllHealth(checks: ToolHealthCheck[]): Promise<ToolHealthResult[]> {
  return Promise.all(checks.map((check) => checkToolHealth(check)));
}
