import { describe, expect, it } from "vitest";
import { DemoPayProvider } from "@/payments/demo";
import { normalizeTzPhone } from "@/payments/provider";
import { normalizeProviderStatus } from "@/payments/zenopay";

describe("manufacturer payment collection", () => {
  it("normalizes Tanzanian mobile-money numbers", () => {
    expect(normalizeTzPhone("+255 712 345 678")).toBe("0712345678");
    expect(normalizeTzPhone("0712-345-678")).toBe("0712345678");
    expect(normalizeTzPhone("+44 20 7946 0958")).toBeNull();
  });

  it("maps provider statuses conservatively", () => {
    expect(normalizeProviderStatus("COMPLETED")).toBe("completed");
    expect(normalizeProviderStatus("cancelled")).toBe("failed");
    expect(normalizeProviderStatus("processing")).toBe("pending");
    expect(normalizeProviderStatus(undefined)).toBe("unknown");
  });

  it("settles demo collections deterministically", async () => {
    const provider = new DemoPayProvider();
    await expect(provider.checkStatus("pay-1", new Date())).resolves.toEqual({ status: "pending", reference: undefined });
    const completed = await provider.checkStatus("pay-1", new Date(Date.now() - 13_000));
    expect(completed).toEqual({ status: "completed", reference: "DEMO-pay-1" });
  });
});
