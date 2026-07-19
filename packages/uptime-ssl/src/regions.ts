import { request as httpRequest, type RequestOptions } from "node:http";
import { request as httpsRequest, type RequestOptions as HttpsRequestOptions } from "node:https";
import { Resolver } from "node:dns/promises";
import { inspectCertificate, type CheckResult, type Target } from "./monitor.js";

export interface Region {
  name: string;
  resolver?: string;
  proxyUrl?: string;
  timeoutMs?: number;
}

export interface RegionCheckResult extends CheckResult {
  region: string;
  resolvedIp?: string;
}

async function resolveIp(hostname: string, resolverIp?: string): Promise<string | undefined> {
  if (!resolverIp) return undefined;
  const resolver = new Resolver();
  resolver.setServers([resolverIp]);
  try {
    return (await resolver.resolve4(hostname))[0];
  } catch {
    try {
      return (await resolver.resolve6(hostname))[0];
    } catch {
      return undefined;
    }
  }
}

function requestDirect(options: HttpsRequestOptions, isHttps: boolean, timeoutMs: number): Promise<{ status: number; latencyMs: number }> {
  return new Promise((resolve, reject) => {
    const started = performance.now();
    const requester = isHttps ? httpsRequest : httpRequest;
    const req = requester(options as RequestOptions, (res) => {
      res.resume();
      res.on("end", () => resolve({ status: res.statusCode ?? 0, latencyMs: Math.round(performance.now() - started) }));
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error("Timeout ao checar região")));
    req.once("error", reject);
    req.end();
  });
}

function requestThroughProxy(targetUrl: URL, proxyUrl: URL, timeoutMs: number, headers: Record<string, string>): Promise<{ status: number; latencyMs: number }> {
  return new Promise((resolve, reject) => {
    const started = performance.now();
    const req = httpRequest({
      host: proxyUrl.hostname,
      port: Number(proxyUrl.port || 80),
      method: "GET",
      path: targetUrl.href,
      headers: { host: targetUrl.hostname, ...headers }
    }, (res) => {
      res.resume();
      res.on("end", () => resolve({ status: res.statusCode ?? 0, latencyMs: Math.round(performance.now() - started) }));
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error("Timeout ao checar via proxy")));
    req.once("error", reject);
    req.end();
  });
}

export async function checkTargetInRegion(target: Target, region: Region): Promise<RegionCheckResult> {
  const started = performance.now();
  const timeoutMs = region.timeoutMs ?? target.timeoutMs ?? 10_000;
  const targetUrl = new URL(target.url);
  const isHttps = targetUrl.protocol === "https:";
  let resolvedIp: string | undefined;
  try {
    let status: number;
    let latencyMs: number;
    if (region.proxyUrl) {
      const result = await requestThroughProxy(targetUrl, new URL(region.proxyUrl), timeoutMs, target.headers ?? {});
      status = result.status;
      latencyMs = result.latencyMs;
    } else {
      resolvedIp = await resolveIp(targetUrl.hostname, region.resolver);
      const options: HttpsRequestOptions = {
        host: resolvedIp ?? targetUrl.hostname,
        port: Number(targetUrl.port || (isHttps ? 443 : 80)),
        path: targetUrl.pathname + targetUrl.search,
        headers: { host: targetUrl.hostname, ...target.headers },
        ...(isHttps && resolvedIp ? { servername: targetUrl.hostname } : {})
      };
      const result = await requestDirect(options, isHttps, timeoutMs);
      status = result.status;
      latencyMs = result.latencyMs;
    }
    const accepted = target.expectedStatus ?? [200, 201, 202, 204, 301, 302];
    const certificate = isHttps ? await inspectCertificate(targetUrl).catch(() => undefined) : undefined;
    const sslOk = !certificate || certificate.daysRemaining >= (target.sslWarningDays ?? 14);
    return {
      region: region.name, name: target.name, url: target.url,
      ok: accepted.includes(status) && sslOk, status, latencyMs,
      checkedAt: new Date().toISOString(), certificate, resolvedIp
    };
  } catch (error) {
    return {
      region: region.name, name: target.name, url: target.url, ok: false,
      latencyMs: Math.round(performance.now() - started),
      checkedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
      resolvedIp
    };
  }
}

export async function checkTargetAcrossRegions(target: Target, regions: Region[]): Promise<RegionCheckResult[]> {
  return Promise.all(regions.map((region) => checkTargetInRegion(target, region)));
}
