export interface Violation {
  rule: string;
  message: string;
  severity: "error" | "warning";
}

export interface K8sManifest {
  kind?: string;
  metadata?: { name?: string; labels?: Record<string, string> };
  spec?: {
    template?: { spec?: { containers?: K8sContainer[] } };
    containers?: K8sContainer[];
  };
  [key: string]: unknown;
}

interface K8sContainer {
  name?: string;
  securityContext?: { privileged?: boolean };
  resources?: { requests?: Record<string, string>; limits?: Record<string, string> };
}

const REQUIRED_LABELS = ["portal.swissknife/team", "portal.swissknife/owner"];

function containersOf(manifest: K8sManifest): K8sContainer[] {
  return manifest.spec?.containers ?? manifest.spec?.template?.spec?.containers ?? [];
}

export function validateManifest(manifest: K8sManifest, requiredLabels: string[] = REQUIRED_LABELS): Violation[] {
  const violations: Violation[] = [];
  const labels = manifest.metadata?.labels ?? {};
  for (const label of requiredLabels) {
    if (!labels[label]) violations.push({ rule: "require-labels", message: `Label obrigatória ausente: ${label}`, severity: "error" });
  }
  const containers = containersOf(manifest);
  if (["Deployment", "Pod", "StatefulSet", "DaemonSet"].includes(manifest.kind ?? "") && containers.length === 0) {
    violations.push({ rule: "no-containers", message: "Nenhum container definido", severity: "warning" });
  }
  for (const container of containers) {
    const name = container.name ?? "(sem nome)";
    if (container.securityContext?.privileged === true) {
      violations.push({ rule: "no-privileged", message: `Container '${name}' não pode ser privileged`, severity: "error" });
    }
    if (!container.resources?.requests?.cpu || !container.resources?.requests?.memory) {
      violations.push({ rule: "require-requests", message: `Container '${name}' deve definir requests de cpu e memory`, severity: "error" });
    }
    if (!container.resources?.limits?.cpu || !container.resources?.limits?.memory) {
      violations.push({ rule: "require-limits", message: `Container '${name}' deve definir limits de cpu e memory`, severity: "error" });
    }
  }
  return violations;
}
