import { describe, expect, it } from "vitest";
import { maskPhone, phoneThreadKey } from "@/lib/phones";

describe("message phone privacy", () => {
  it("keeps colliding masked numbers in separate threads", () => {
    const first = "+255700111123";
    const second = "+255700999123";

    expect(maskPhone(first)).toBe(maskPhone(second));
    expect(phoneThreadKey("business-a", first)).not.toBe(phoneThreadKey("business-a", second));
  });

  it("scopes stable thread keys to the business", () => {
    const phone = "+255700111123";

    expect(phoneThreadKey("business-a", phone)).toBe(phoneThreadKey("business-a", phone));
    expect(phoneThreadKey("business-a", phone)).not.toBe(phoneThreadKey("business-b", phone));
  });
});
