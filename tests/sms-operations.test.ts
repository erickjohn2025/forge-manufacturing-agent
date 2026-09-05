import { describe, expect, it } from "vitest";
import { parseStaffSms } from "@/agent/sms-operations";
import { dateAtLocalNoon } from "@/lib/dates";

describe("factory SMS commands", () => {
  it("treats ordinary natural language as a manufacturing objective", () => {
    expect(parseStaffSms("Make sure we're ready to fulfil all orders due Friday")).toEqual({
      kind: "OBJECTIVE",
      text: "Make sure we're ready to fulfil all orders due Friday",
    });
  });

  it("recognises approval and receiving commands", () => {
    expect(parseStaffSms("Approve RFQ-104")).toEqual({ kind: "APPROVE", reference: "RFQ-104" });
    expect(parseStaffSms("Received PO-204")).toEqual({ kind: "RECEIVE", reference: "PO-204" });
  });

  it("extracts a job code and actual output from a natural supervisor update", () => {
    expect(parseStaffSms("Job PJ-301 finished. We produced 4,000")).toEqual({
      kind: "COMPLETE_PRODUCTION",
      reference: "PJ-301",
      actualQuantity: 4000,
    });
  });

  it("supports status and help", () => {
    expect(parseStaffSms("status")).toEqual({ kind: "STATUS" });
    expect(parseStaffSms("help")).toEqual({ kind: "HELP" });
  });

  it("recognises the explicit demo reset command", () => {
    expect(parseStaffSms("RESET HERO")).toEqual({ kind: "RESET_HERO" });
    expect(parseStaffSms("start over")).toEqual({ kind: "RESET_HERO" });
  });
});

describe("business-local objective dates", () => {
  it("keeps Friday and its Tuesday material deadline on the intended local weekdays", () => {
    const friday = dateAtLocalNoon("2026-09-11", "Africa/Dar_es_Salaam");
    const tuesday = new Date(friday.getTime() - 3 * 86_400_000);
    const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: "Africa/Dar_es_Salaam" });
    expect(weekday.format(friday)).toBe("Friday");
    expect(weekday.format(tuesday)).toBe("Tuesday");
  });
});
