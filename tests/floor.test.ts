import { describe, expect, it } from "vitest";
import { floorHorizon, isStockShortage, scopeToTenant } from "@/lib/floor-summary";

describe("factory floor shortage flag", () => {
  it("flags stock when available is below safety stock", () => {
    expect(isStockShortage(199, 200)).toBe(true);
    expect(isStockShortage(200, 200)).toBe(false);
    expect(isStockShortage(2400, 200)).toBe(false);
  });

  it("does not flag when safety stock is zero", () => {
    expect(isStockShortage(0, 0)).toBe(false);
  });
});

describe("factory floor tenant scoping", () => {
  it("keeps only rows that belong to the requested business", () => {
    const rows = [
      { id: "a", businessId: "kilimanjaro-foods" },
      { id: "b", businessId: "zanzibar-cosmetics" },
      { id: "c", businessId: "kilimanjaro-foods" },
    ];
    expect(scopeToTenant(rows, "kilimanjaro-foods").map((row) => row.id)).toEqual(["a", "c"]);
    expect(scopeToTenant(rows, "zanzibar-cosmetics")).toHaveLength(1);
    expect(scopeToTenant(rows, "unknown-tenant")).toEqual([]);
  });

  it("builds a seven-day horizon used by the tenant-scoped due-order query", () => {
    const now = new Date("2026-09-05T12:00:00.000Z");
    const { from, to } = floorHorizon(now);
    expect(from.toISOString()).toBe("2026-09-05T12:00:00.000Z");
    expect(to.toISOString()).toBe("2026-09-12T12:00:00.000Z");
  });
});
