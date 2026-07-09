import { spawn } from "node:child_process";

export type ProviderName = "aws" | "azure" | "gcp";
export interface Resource { provider: ProviderName; id: string; name: string; region?: string; state?: string }

function execute(command: string, args: string[]): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = ""; let stderr = "";
    child.stdout.on("data", (chunk) => stdout += chunk);
    child.stderr.on("data", (chunk) => stderr += chunk);
    child.once("error", (error) => reject(new Error(`${command} não está disponível: ${error.message}`)));
    child.once("close", (code) => {
      if (code !== 0) return reject(new Error(stderr.trim() || `${command} terminou com ${code}`));
      try { resolve(JSON.parse(stdout)); } catch { reject(new Error(`Resposta inválida de ${command}`)); }
    });
  });
}

export async function listInstances(provider: ProviderName): Promise<Resource[]> {
  if (provider === "aws") {
    const data = await execute("aws", ["ec2", "describe-instances", "--output", "json"]) as any;
    return (data.Reservations ?? []).flatMap((r: any) => r.Instances ?? []).map((vm: any) => ({
      provider, id: vm.InstanceId, name: vm.Tags?.find((t: any) => t.Key === "Name")?.Value ?? vm.InstanceId,
      region: vm.Placement?.AvailabilityZone, state: vm.State?.Name
    }));
  }
  if (provider === "azure") {
    const data = await execute("az", ["vm", "list", "-d", "-o", "json"]) as any[];
    return data.map((vm) => ({ provider, id: vm.id, name: vm.name, region: vm.location, state: vm.powerState }));
  }
  const data = await execute("gcloud", ["compute", "instances", "list", "--format=json"]) as any[];
  return data.map((vm) => ({
    provider, id: String(vm.id), name: vm.name, region: vm.zone?.split("/").at(-1),
    state: vm.status?.toLowerCase()
  }));
}

export async function listAll(): Promise<{ resources: Resource[]; errors: Record<string, string> }> {
  const providers: ProviderName[] = ["aws", "azure", "gcp"];
  const settled = await Promise.allSettled(providers.map(listInstances));
  const resources: Resource[] = []; const errors: Record<string, string> = {};
  settled.forEach((result, index) => {
    const provider = providers[index]!;
    if (result.status === "fulfilled") resources.push(...result.value);
    else errors[provider] = result.reason instanceof Error ? result.reason.message : String(result.reason);
  });
  return { resources, errors };
}
