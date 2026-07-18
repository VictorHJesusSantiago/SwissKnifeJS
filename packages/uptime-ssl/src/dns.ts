import { Resolver } from "node:dns/promises";

export type RecordType = "A" | "AAAA" | "CNAME" | "MX" | "TXT" | "NS" | "SOA";

export interface DnsLookupResult {
  resolver?: string;
  type: RecordType;
  records: string[];
  error?: string;
}

export interface ResolverComparison {
  hostname: string;
  type: RecordType;
  byResolver: Record<string, string[]>;
  consistent: boolean;
}

async function resolveWith(resolver: Resolver, hostname: string, type: RecordType): Promise<string[]> {
  switch (type) {
    case "A": return await resolver.resolve4(hostname);
    case "AAAA": return await resolver.resolve6(hostname);
    case "CNAME": return await resolver.resolveCname(hostname);
    case "MX": return (await resolver.resolveMx(hostname)).map((record) => `${record.priority} ${record.exchange}`);
    case "TXT": return (await resolver.resolveTxt(hostname)).map((record) => record.join(""));
    case "NS": return await resolver.resolveNs(hostname);
    case "SOA": {
      const soa = await resolver.resolveSoa(hostname);
      return [`${soa.nsname} ${soa.hostmaster} ${soa.serial}`];
    }
  }
}

export async function lookupRecords(hostname: string, types: RecordType[], resolverIp?: string): Promise<DnsLookupResult[]> {
  const resolver = new Resolver();
  if (resolverIp) resolver.setServers([resolverIp]);
  const results: DnsLookupResult[] = [];
  for (const type of types) {
    try {
      results.push({ resolver: resolverIp, type, records: await resolveWith(resolver, hostname, type) });
    } catch (error) {
      results.push({ resolver: resolverIp, type, records: [], error: error instanceof Error ? error.message : String(error) });
    }
  }
  return results;
}

export async function compareResolvers(hostname: string, types: RecordType[], resolvers: string[]): Promise<ResolverComparison[]> {
  const comparisons: ResolverComparison[] = [];
  for (const type of types) {
    const byResolver: Record<string, string[]> = {};
    for (const resolverIp of resolvers) {
      const [result] = await lookupRecords(hostname, [type], resolverIp);
      byResolver[resolverIp] = (result?.records ?? []).slice().sort();
    }
    const signatures = new Set(Object.values(byResolver).map((records) => records.join(",")));
    comparisons.push({ hostname, type, byResolver, consistent: signatures.size <= 1 });
  }
  return comparisons;
}
