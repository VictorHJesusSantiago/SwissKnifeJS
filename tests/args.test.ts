import { describe, expect, it } from "vitest";
import { parseArgs } from "../packages/core/src/args.js";
describe("parseArgs", () => {
  it("interpreta posicionais, flags e valores", () => {
    expect(parseArgs(["run", "--port", "4000", "--once", "--name=demo"]))
      .toEqual({ _: ["run"], port: "4000", once: true, name: "demo" });
  });
});
