import { describe, expect, it } from "vitest";
import { retrospective } from "../packages/sprint-retro/src/report.js";
describe("retrospectiva", () => {
  it("resume entregas e pendências", () => {
    const text = retrospective({ name: "Sprint 1", items: [
      { id: "1", title: "Entrega", type: "Story", status: "Done", points: 3, labels: [] },
      { id: "2", title: "Depois", type: "Story", status: "Doing", labels: [] }
    ] });
    expect(text).toContain("1 itens concluídos");
    expect(text).toContain("3 pontos entregues");
  });
});
