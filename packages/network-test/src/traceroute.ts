import { spawn } from "node:child_process";
import { createSocket } from "node:dgram";
import { platform } from "node:process";

export interface TracerouteHop {
  ttl: number;
  address?: string;
  rttMs?: number;
  timedOut: boolean;
}

export interface TracerouteResult {
  target: string;
  hops: TracerouteHop[];
  completed: boolean;
}

/** Extrai o endereço IP e o RTT (ms) de uma linha de saída do utilitário de traceroute do SO. */
export function parseTracerouteLine(line: string, hopNumber: number): TracerouteHop {
  const trimmed = line.trim();
  if (/\*\s*\*\s*\*/.test(trimmed) || /Request timed out/i.test(trimmed)) {
    return { ttl: hopNumber, timedOut: true };
  }
  const addressMatch = trimmed.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
  const rttMatch = trimmed.match(/([\d.]+)\s*ms/i);
  return {
    ttl: hopNumber,
    address: addressMatch?.[1],
    rttMs: rttMatch ? Number(rttMatch[1]) : undefined,
    timedOut: !addressMatch
  };
}

/** Executa o utilitário de traceroute nativo do SO (tracert no Windows, traceroute no Unix) como fallback multiplataforma. */
export function runSystemTraceroute(target: string, maxHops = 30): Promise<TracerouteResult> {
  return new Promise((resolve, reject) => {
    const isWindows = platform === "win32";
    const command = isWindows ? "tracert" : "traceroute";
    const args = isWindows ? ["-h", String(maxHops), "-w", "1000", target] : ["-m", String(maxHops), "-w", "1", target];
    const child = spawn(command, args);
    let output = "";
    let ttl = 0;
    const hops: TracerouteHop[] = [];
    child.stdout.on("data", (chunk: Buffer) => { output += chunk.toString("utf8"); });
    child.on("error", (error) => reject(new Error(`Falha ao executar ${command}: ${error.message}`)));
    child.on("close", () => {
      for (const line of output.split(/\r?\n/)) {
        if (!/^\s*\d+/.test(line)) continue;
        ttl += 1;
        hops.push(parseTracerouteLine(line, ttl));
      }
      resolve({ target, hops, completed: hops.length > 0 });
    });
  });
}

/**
 * Traceroute simplificado usando UDP com TTL incremental (sem depender de sockets raw/ICMP,
 * que exigem privilégios elevados). Envia um datagrama por TTL e mede o tempo até obter
 * qualquer resposta (ou timeout), servindo como aproximação portátil quando o utilitário do
 * SO não está disponível.
 */
export async function udpTtlProbe(target: string, port: number, maxHops = 30, timeoutMs = 1000): Promise<TracerouteResult> {
  const hops: TracerouteHop[] = [];
  for (let ttl = 1; ttl <= maxHops; ttl += 1) {
    const hop = await probeOnce(target, port, ttl, timeoutMs);
    hops.push(hop);
  }
  return { target, hops, completed: true };
}

function probeOnce(target: string, port: number, ttl: number, timeoutMs: number): Promise<TracerouteHop> {
  return new Promise((resolve) => {
    const socket = createSocket("udp4");
    let settled = false;
    const finish = (hop: TracerouteHop) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.close();
      resolve(hop);
    };
    const timer = setTimeout(() => finish({ ttl, timedOut: true }), timeoutMs);
    const started = performance.now();
    socket.on("error", () => finish({ ttl, timedOut: true }));
    socket.on("message", () => finish({ ttl, address: target, rttMs: Number((performance.now() - started).toFixed(2)), timedOut: false }));
    try {
      socket.setTTL(ttl);
      socket.send(Buffer.from("probe"), port, target);
    } catch {
      finish({ ttl, timedOut: true });
    }
  });
}

export interface MtuResult {
  target: string;
  pathMtu?: number;
  testedSizes: { size: number; ok: boolean }[];
}

/**
 * Descoberta simplificada de Path MTU: testa envio de payloads UDP de tamanhos decrescentes
 * (a partir do MTU de Ethernet padrão) e considera "ok" o maior tamanho aceito localmente pelo
 * socket sem erro de fragmentação (EMSGSIZE), servindo como aproximação portátil já que setar
 * o bit DF diretamente não é exposto pela API `dgram` do Node em todas as plataformas.
 */
export async function discoverPathMtu(target: string, port: number, candidateSizes = [1500, 1492, 1400, 1280, 1024, 576, 508]): Promise<MtuResult> {
  const testedSizes: { size: number; ok: boolean }[] = [];
  let pathMtu: number | undefined;
  for (const size of candidateSizes) {
    const ok = await trySendSize(target, port, size);
    testedSizes.push({ size, ok });
    if (ok && pathMtu === undefined) pathMtu = size;
  }
  return { target, pathMtu, testedSizes };
}

function trySendSize(target: string, port: number, size: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createSocket("udp4");
    const payload = Buffer.alloc(size, 0x01);
    socket.send(payload, port, target, (error) => {
      socket.close();
      resolve(!error);
    });
  });
}
