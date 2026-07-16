import { createSocket, type Socket } from "node:dgram";

export interface JitterSample { sequence: number; sentAt: number; rttMs?: number }

export interface JitterTestResult {
  host: string;
  port: number;
  packetsSent: number;
  packetsReceived: number;
  lossPercent: number;
  avgLatencyMs: number;
  jitterMs: number;
  minLatencyMs: number;
  maxLatencyMs: number;
  measuredAt: string;
}

/** Calcula jitter (variação média de latência entre pacotes consecutivos, estilo RFC 3550) e perda a partir de uma lista de RTTs (undefined = pacote perdido). */
export function computeJitterStats(rtts: (number | undefined)[]): {
  packetsSent: number; packetsReceived: number; lossPercent: number;
  avgLatencyMs: number; jitterMs: number; minLatencyMs: number; maxLatencyMs: number;
} {
  const packetsSent = rtts.length;
  const received = rtts.filter((rtt): rtt is number => rtt !== undefined);
  const packetsReceived = received.length;
  const lossPercent = packetsSent === 0 ? 0 : round(((packetsSent - packetsReceived) / packetsSent) * 100);
  if (packetsReceived === 0) {
    return { packetsSent, packetsReceived, lossPercent, avgLatencyMs: 0, jitterMs: 0, minLatencyMs: 0, maxLatencyMs: 0 };
  }
  const avgLatencyMs = round(received.reduce((sum, n) => sum + n, 0) / packetsReceived);
  let jitterAccumulator = 0;
  let jitterCount = 0;
  for (let index = 1; index < received.length; index += 1) {
    jitterAccumulator += Math.abs(received[index]! - received[index - 1]!);
    jitterCount += 1;
  }
  const jitterMs = round(jitterCount === 0 ? 0 : jitterAccumulator / jitterCount);
  return {
    packetsSent, packetsReceived, lossPercent, avgLatencyMs, jitterMs,
    minLatencyMs: round(Math.min(...received)), maxLatencyMs: round(Math.max(...received))
  };
}

/** Inicia um listener UDP de eco (echo) usado como alvo local para testes ponta a ponta de jitter/perda. */
export function startJitterEchoServer(port: number): Socket {
  const socket = createSocket("udp4");
  socket.on("message", (message, remote) => socket.send(message, remote.port, remote.address));
  socket.bind(port);
  return socket;
}

export interface JitterTestOptions {
  host: string;
  port: number;
  count?: number;
  intervalMs?: number;
  timeoutMs?: number;
}

/** Envia uma sequência de pacotes UDP a um host:porta (ex.: um listener de eco local) medindo RTT por pacote. */
export async function runJitterTest(options: JitterTestOptions): Promise<JitterTestResult> {
  const { host, port, count = 20, intervalMs = 50, timeoutMs = 1000 } = options;
  const socket = createSocket("udp4");
  const rtts: (number | undefined)[] = new Array(count).fill(undefined);
  const pending = new Map<number, { sentAt: number; timer: NodeJS.Timeout; resolve: () => void }>();

  socket.on("message", (message) => {
    const sequence = message.readUInt32BE(0);
    const entry = pending.get(sequence);
    if (!entry) return;
    clearTimeout(entry.timer);
    pending.delete(sequence);
    rtts[sequence] = performance.now() - entry.sentAt;
    entry.resolve();
  });

  await new Promise<void>((resolve, reject) => {
    socket.once("error", reject);
    socket.bind(0, () => resolve());
  });

  for (let sequence = 0; sequence < count; sequence += 1) {
    const buffer = Buffer.alloc(4);
    buffer.writeUInt32BE(sequence, 0);
    const sentAt = performance.now();
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => { pending.delete(sequence); resolve(); }, timeoutMs);
      pending.set(sequence, { sentAt, timer, resolve });
      socket.send(buffer, port, host, () => { /* envio assíncrono, resposta tratada pelo listener */ });
    });
    if (intervalMs > 0 && sequence < count - 1) await sleep(intervalMs);
  }
  for (const { timer } of pending.values()) clearTimeout(timer);
  socket.close();

  const stats = computeJitterStats(rtts);
  return { host, port, ...stats, measuredAt: new Date().toISOString() };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const round = (value: number) => Number(value.toFixed(2));
