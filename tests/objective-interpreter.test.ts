import { describe, expect, it } from "vitest";
import { interpretObjective } from "@/agent/objective-interpreter";

describe("objective interpretation", () => {
  it("resolves Friday and selects the manufacturing operating model without API credentials", async () => {
    const previous = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const result = await interpretObjective("Make sure we're ready to fulfil all orders due Friday", new Date("2026-09-04T09:00:00Z"));
    process.env.OPENAI_API_KEY = previous;
    expect(result.dueDate).toBe("2026-09-11");
    expect(result.domains).toEqual(["PLAN", "SOURCE", "MAKE", "DELIVER"]);
    expect(result.source).toBe("deterministic-fallback");
  });
});
