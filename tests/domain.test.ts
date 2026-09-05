import { describe, expect, it } from "vitest";
import { calculateNetShortage, calculateProductionRequirement, purchasePayloadHash } from "@/domain";

describe("deterministic planning", () => {
  it("calculates the hero production requirement", () => {
    expect(calculateProductionRequirement(5_000, 1_000)).toBe(4_000);
  });

  it("calculates the hero packaging shortage", () => {
    expect(calculateNetShortage({ grossRequirement: 4_000, safetyStock: 200, available: 2_400, confirmedIncoming: 400 })).toBe(1_400);
  });

  it("never returns negative production or shortage", () => {
    expect(calculateProductionRequirement(100, 120)).toBe(0);
    expect(calculateNetShortage({ grossRequirement: 100, safetyStock: 10, available: 200, confirmedIncoming: 50 })).toBe(0);
  });

  it("aggregates shared material demand arithmetically", () => {
    const sharedBottles = 100 * 1 + 150 * 1;
    expect(sharedBottles).toBe(250);
    expect(calculateNetShortage({ grossRequirement: sharedBottles, safetyStock: 50, available: 100, confirmedIncoming: 0 })).toBe(200);
  });
});

describe("approval integrity", () => {
  it("binds approval to every material purchase field", () => {
    const base = { supplierId: "supplier-a", materialId: "packaging", quantity: 1_400, unitPrice: 575, currency: "TZS", deliveryAt: new Date("2026-09-07T09:00:00Z") };
    expect(purchasePayloadHash(base)).not.toBe(purchasePayloadHash({ ...base, unitPrice: 576 }));
    expect(purchasePayloadHash(base)).not.toBe(purchasePayloadHash({ ...base, deliveryAt: new Date("2026-09-08T09:00:00Z") }));
  });
});
