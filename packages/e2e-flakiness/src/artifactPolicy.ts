import { mkdir, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Outcome } from "./report.js";

export type ArtifactDecision = "retain" | "discard";

/**
 * Decides whether to keep screenshot/video artifacts for a test's attempts.
 * - All passed (no retries needed): discard, nothing interesting happened.
 * - All failed (consistent failure): discard, artifact adds no flakiness signal.
 * - Mixed fail-then-pass (intermittent): retain, this is exactly the evidence we want.
 */
export function decideArtifactRetention(attempts: Outcome[] | undefined): ArtifactDecision {
  if (!attempts || attempts.length < 2) return "discard";
  const hasFailure = attempts.some((outcome) => outcome === "failed");
  const hasPass = attempts.some((outcome) => outcome === "passed");
  return hasFailure && hasPass ? "retain" : "discard";
}

export interface ArtifactRef {
  /** Absolute or relative path to the artifact file (screenshot, video, trace...) as produced by Playwright. */
  path: string;
}

export interface ApplyArtifactPolicyOptions {
  attempts: Outcome[] | undefined;
  artifacts: ArtifactRef[];
  /** Directory intermittent-test artifacts are moved into for long-term retention. */
  retainDir: string;
  /** Test title, used to namespace retained artifacts. */
  title: string;
}

export interface ApplyArtifactPolicyResult {
  decision: ArtifactDecision;
  retained: string[];
  discarded: string[];
}

function safeSegment(title: string): string {
  return title.replace(/[^a-z0-9-_]+/gi, "_").slice(0, 150);
}

/** Applies the retention decision to real files on disk: moves kept artifacts, deletes discarded ones. */
export async function applyArtifactPolicy(options: ApplyArtifactPolicyOptions): Promise<ApplyArtifactPolicyResult> {
  const decision = decideArtifactRetention(options.attempts);
  const retained: string[] = [];
  const discarded: string[] = [];
  for (const artifact of options.artifacts) {
    if (decision === "retain") {
      const target = join(options.retainDir, safeSegment(options.title), artifact.path.split(/[\\/]/).pop() ?? "artifact");
      await mkdir(dirname(target), { recursive: true });
      await rename(artifact.path, target);
      retained.push(target);
    } else {
      await rm(artifact.path, { force: true });
      discarded.push(artifact.path);
    }
  }
  return { decision, retained, discarded };
}
