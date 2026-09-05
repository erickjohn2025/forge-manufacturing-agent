import { describe, expect, it, vi } from "vitest";
import { SupplierQuoteExtractor, extractQuoteDeterministically } from "@/agent/openai";

const context = {
  requestedQuantity: 1_400,
  defaultCurrency: "TZS",
  businessTimeZone: "Africa/Dar_es_Salaam",
  referenceAt: new Date("2026-09-04T09:00:00.000Z"), // Friday locally
};

describe("deterministic supplier quote extraction", () => {
  it("does not mistake 'can do 540 each' for an available quantity", () => {
    const result = extractQuoteDeterministically({
      message: "I can do 540 each but Thursday.",
      requestedQuantity: 1400,
      defaultCurrency: "TZS",
      businessTimeZone: "Africa/Dar_es_Salaam",
      referenceAt: new Date("2026-09-04T09:00:00.000Z"),
    });
    expect(result.unitPrice).toBe(540);
    expect(result.quantityAvailable).toBe(1400);
    expect(result.deliveryDate).toBe("2026-09-10");
  });
  it("extracts natural price and the next delivery weekday", () => {
    expect(extractQuoteDeterministically({
      ...context,
      message: "575 each. Can deliver Monday morning.",
    })).toMatchObject({
      unitPrice: 575,
      currency: "TZS",
      quantityAvailable: 1_400,
      deliveryDate: "2026-09-07",
      missingFields: [],
      source: "deterministic-fallback",
    });
  });

  it("extracts an explicitly limited quantity and delivery date", () => {
    expect(extractQuoteDeterministically({
      ...context,
      message: "I can supply 900 units at TZS 540 each, delivery 2026-09-10",
    })).toMatchObject({
      unitPrice: 540,
      currency: "TZS",
      quantityAvailable: 900,
      deliveryDate: "2026-09-10",
    });
  });

  it("returns missing fields instead of inventing ambiguous facts", () => {
    const quote = extractQuoteDeterministically({ ...context, message: "Yes, that should be fine." });
    expect(quote.unitPrice).toBeNull();
    expect(quote.deliveryDate).toBeNull();
    expect(quote.missingFields).toEqual(["unitPrice", "currency", "deliveryDate"]);
    expect(quote.confidence).toBeLessThan(0.5);
  });
});

describe("OpenAI quote extraction", () => {
  it("uses Responses structured output and fills accepted RFQ quantity", async () => {
    const create = vi.fn().mockResolvedValue({
      output_text: JSON.stringify({
        unitPrice: 575,
        currency: null,
        quantityAvailable: null,
        deliveryDate: "2026-09-07",
        confidence: 0.96,
        missingFields: ["currency", "quantityAvailable"],
      }),
    });
    const extractor = new SupplierQuoteExtractor({ client: { responses: { create } }, model: "test-model" });
    const result = await extractor.extract({ ...context, message: "575 each, Monday morning" });

    expect(result).toMatchObject({
      source: "openai",
      currency: "TZS",
      quantityAvailable: 1_400,
      missingFields: [],
    });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ model: "test-model", store: false }));
  });

  it("falls back deterministically when the provider fails", async () => {
    const create = vi.fn().mockRejectedValue(new Error("provider unavailable"));
    const extractor = new SupplierQuoteExtractor({ client: { responses: { create } } });
    const result = await extractor.extract({ ...context, message: "540 each but Thursday" });
    expect(result).toMatchObject({
      source: "deterministic-fallback",
      unitPrice: 540,
      deliveryDate: "2026-09-10",
    });
  });
});
