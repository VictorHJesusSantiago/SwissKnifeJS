export type ProviderName = "aws" | "azure" | "gcp";

export interface CommandTemplate {
  aws: string;
  azure: string;
  gcp: string;
}

/** Dicionário estático e extensível de comandos equivalentes entre CLIs. */
export const COMMAND_MAP: Record<string, CommandTemplate> = {
  "list-buckets": {
    aws: "aws s3 ls",
    azure: "az storage account list",
    gcp: "gcloud storage buckets list",
  },
  "create-bucket": {
    aws: "aws s3 mb s3://<NAME>",
    azure: "az storage container create --name <NAME>",
    gcp: "gcloud storage buckets create gs://<NAME>",
  },
  "list-instances": {
    aws: "aws ec2 describe-instances",
    azure: "az vm list -d",
    gcp: "gcloud compute instances list",
  },
  "create-vm": {
    aws: "aws ec2 run-instances --image-id <IMAGE> --instance-type <TYPE>",
    azure: "az vm create --name <NAME> --image <IMAGE>",
    gcp: "gcloud compute instances create <NAME> --image <IMAGE>",
  },
  "delete-vm": {
    aws: "aws ec2 terminate-instances --instance-ids <ID>",
    azure: "az vm delete --name <NAME> --yes",
    gcp: "gcloud compute instances delete <NAME>",
  },
  "list-resource-groups": {
    aws: "aws cloudformation list-stacks",
    azure: "az group list",
    gcp: "gcloud resource-manager folders list",
  },
};

export interface TranslationResult {
  action: string;
  source: { provider: ProviderName; command: string };
  translations: Partial<Record<ProviderName, string>>;
}

export function registerCommandMapping(action: string, template: CommandTemplate): void {
  COMMAND_MAP[action] = template;
}

export function detectProvider(command: string): ProviderName | undefined {
  const bin = command.trim().split(/\s+/)[0];
  if (bin === "aws") return "aws";
  if (bin === "az") return "azure";
  if (bin === "gcloud") return "gcp";
  return undefined;
}

function stripPlaceholders(command: string): string[] {
  return command.split(/\s+/).filter((token) => !/^<.+>$/.test(token));
}

export function findAction(command: string, provider: ProviderName): string | undefined {
  const inputTokens = command.trim().split(/\s+/);
  for (const [action, template] of Object.entries(COMMAND_MAP)) {
    const templateTokens = stripPlaceholders(template[provider]);
    if (templateTokens.length > 0 && templateTokens.every((token, index) => inputTokens[index] === token)) {
      return action;
    }
  }
  return undefined;
}

export function translateCommand(command: string, targets?: ProviderName[]): TranslationResult {
  const provider = detectProvider(command);
  if (!provider) throw new Error(`Não foi possível identificar o provedor do comando: ${command}`);
  const action = findAction(command, provider);
  if (!action) throw new Error(`Comando não mapeado na tabela de tradução: ${command}`);
  const template = COMMAND_MAP[action]!;
  const wanted = (targets ?? (["aws", "azure", "gcp"] as ProviderName[])).filter((p) => p !== provider);
  const translations: Partial<Record<ProviderName, string>> = {};
  for (const target of wanted) translations[target] = template[target];
  return { action, source: { provider, command }, translations };
}
