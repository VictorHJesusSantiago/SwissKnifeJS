import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyArtifactPolicy, decideArtifactRetention } from "../packages/e2e-flakiness/src/artifactPolicy.js";

describe("artifactPolicy", () => {
  it("retém artefatos apenas quando houve falha seguida de sucesso (intermitente)", () => {
    expect(decideArtifactRetention(["failed", "passed"])).toBe("retain");
  });

  it("descarta artefatos de falha consistente", () => {
    expect(decideArtifactRetention(["failed", "failed"])).toBe("discard");
  });

  it("descarta artefatos de sucesso direto", () => {
    expect(decideArtifactRetention(["passed"])).toBe("discard");
  });

  it("descarta quando não há tentativas", () => {
    expect(decideArtifactRetention(undefined)).toBe("discard");
  });

  describe("aplicação em disco", () => {
    let dir: string;
    beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), "e2e-artifacts-")); });
    afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

    it("move artefato para o diretório de retenção quando intermitente", async () => {
      const sourceFile = join(dir, "shot.png");
      await writeFile(sourceFile, "fake-png");
      const retainDir = join(dir, "kept");
      const result = await applyArtifactPolicy({
        attempts: ["failed", "passed"],
        artifacts: [{ path: sourceFile }],
        retainDir,
        title: "login › funciona"
      });
      expect(result.decision).toBe("retain");
      expect(result.retained).toHaveLength(1);
      const kept = await readdir(join(retainDir, "login_funciona"));
      expect(kept).toContain("shot.png");
    });

    it("apaga artefato quando falha é consistente", async () => {
      const sourceFile = join(dir, "shot2.png");
      await writeFile(sourceFile, "fake-png");
      const result = await applyArtifactPolicy({
        attempts: ["failed", "failed"],
        artifacts: [{ path: sourceFile }],
        retainDir: join(dir, "kept"),
        title: "checkout › falha"
      });
      expect(result.decision).toBe("discard");
      expect(result.discarded).toEqual([sourceFile]);
      await expect(readdir(dir)).resolves.not.toContain("shot2.png");
    });
  });
});
