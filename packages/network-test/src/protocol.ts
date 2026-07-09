export interface AgentInfo { id: string; region: string; url: string; lastSeen: string }
export interface NetworkResult {
  agentId: string; region: string; latencyMs: number; jitterMs: number;
  downloadMbps: number; uploadMbps: number; measuredAt: string;
}

export async function measure(agent: AgentInfo, bytes = 2_000_000): Promise<NetworkResult> {
  const samples: number[] = [];
  for (let index = 0; index < 5; index += 1) {
    const started = performance.now();
    const ping = await fetch(`${agent.url}/ping`);
    if (!ping.ok) throw new Error(`Agente ${agent.id} indisponível`);
    await ping.arrayBuffer();
    samples.push(performance.now() - started);
  }
  const downloadStarted = performance.now();
  const download = await fetch(`${agent.url}/download?bytes=${bytes}`);
  const downloaded = (await download.arrayBuffer()).byteLength;
  const downloadSeconds = (performance.now() - downloadStarted) / 1000;
  const payload = new Uint8Array(bytes);
  const uploadStarted = performance.now();
  const upload = await fetch(`${agent.url}/upload`, { method: "POST", body: payload });
  if (!upload.ok) throw new Error("Falha no upload");
  const uploadSeconds = (performance.now() - uploadStarted) / 1000;
  const average = samples.reduce((sum, n) => sum + n, 0) / samples.length;
  const jitter = samples.slice(1).reduce((sum, n, i) => sum + Math.abs(n - samples[i]!), 0) / (samples.length - 1);
  return {
    agentId: agent.id, region: agent.region,
    latencyMs: round(average), jitterMs: round(jitter),
    downloadMbps: round(downloaded * 8 / downloadSeconds / 1_000_000),
    uploadMbps: round(bytes * 8 / uploadSeconds / 1_000_000),
    measuredAt: new Date().toISOString()
  };
}
const round = (value: number) => Number(value.toFixed(2));
