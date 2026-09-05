import { describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { runObjectiveCycle } from "@/agent/engine";
import { handleStaffSms } from "@/agent/sms-operations";
import {
  getInventoryPosition, planObjective, recordSupplierResponse
} from "@/domain";

const enabled = Boolean(process.env.TEST_DATABASE_URL);

describe.runIf(enabled)("complete hero objective", () => {
  it("runs the complete hero operation from staff SMS commands", async () => {
    const db = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
    try {
      const business = await db.business.findUniqueOrThrow({ where: { slug: "kilimanjaro-foods" } });
      const fridayOrder = await db.customerOrder.findFirstOrThrow({ where: { businessId: business.id }, orderBy: { dueAt: "asc" } });
      const operator = await db.user.findUniqueOrThrow({ where: { email: "operator@demo.co.tz" } });
      let queuedObjectiveId = "";
      const accepted = await handleStaffSms(db, {
        businessId: business.id, userId: operator.id, role: "OPERATOR", messageId: `integration:${Date.now()}`,
        text: "Make sure we're ready to fulfil all orders due Friday.",
      }, async (id) => { queuedObjectiveId = id; });
      expect(accepted).toContain("Objective accepted");
      const objective = await db.objective.findUniqueOrThrow({ where: { id: queuedObjectiveId } });

      await runObjectiveCycle(objective.id);
      expect((await db.objective.findUniqueOrThrow({ where: { id: objective.id } })).state).toBe("WAITING_EXTERNAL");
      const rfq = await db.rfq.findFirstOrThrow({ where: { objectiveId: objective.id }, include: { recipients: true } });
      expect(Number(rfq.quantity)).toBe(1400);
      expect(rfq.recipients).toHaveLength(2);
      expect(new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: business.timezone }).format(rfq.requiredAt)).toBe("Tuesday");

      const supplierA = await db.supplier.findUniqueOrThrow({ where: { id: "hero-supplier-a" } });
      const supplierB = await db.supplier.findUniqueOrThrow({ where: { id: "hero-supplier-b" } });
      await recordSupplierResponse(db, { businessId: business.id, rfqId: rfq.id, supplierId: supplierA.id, unitPrice: 575, currency: "TZS", quantityAvailable: 1400, deliveryAt: new Date(rfq.requiredAt.getTime() - 86_400_000) });
      await recordSupplierResponse(db, { businessId: business.id, rfqId: rfq.id, supplierId: supplierB.id, unitPrice: 540, currency: "TZS", quantityAvailable: 1400, deliveryAt: new Date(rfq.requiredAt.getTime() + 2 * 86_400_000) });
      await runObjectiveCycle(objective.id);

      expect((await db.objective.findUniqueOrThrow({ where: { id: objective.id } })).state).toBe("WAITING_APPROVAL");
      const approval = await db.approvalRequest.findFirstOrThrow({ where: { objectiveId: objective.id } });
      expect(Number(approval.total)).toBe(805000);
      const approver = await db.user.findUniqueOrThrow({ where: { email: "approver@demo.co.tz" } });
      const approvalReply = await handleStaffSms(db, {
        businessId: business.id, userId: approver.id, role: "APPROVER", messageId: `approve:${objective.id}`,
        text: `Approve ${rfq.code}`,
      }, async () => undefined);
      expect(approvalReply).toContain("approved");
      await runObjectiveCycle(objective.id);
      const po = await db.purchaseOrder.findFirstOrThrow({ where: { objectiveId: objective.id } });
      expect(po.status).toBe("ISSUED");
      expect((await getInventoryPosition(db, business.id, "MATERIAL", "hero-packaging")).onHand).toBe(2400);

      const existingIncoming = await db.purchaseOrder.findFirstOrThrow({ where: { businessId: business.id, code: "PO-203" } });
      const firstReceiptReply = await handleStaffSms(db, {
        businessId: business.id, userId: operator.id, role: "OPERATOR", messageId: `receive-existing:${objective.id}`,
        text: `Received ${existingIncoming.code}`,
      }, async () => undefined);
      expect(firstReceiptReply).toContain("inventory has been updated");
      const receiptReply = await handleStaffSms(db, {
        businessId: business.id, userId: operator.id, role: "OPERATOR", messageId: `receive:${objective.id}`,
        text: `Received ${po.code}`,
      }, async () => undefined);
      expect(receiptReply).toContain(`${po.code} received`);
      expect((await getInventoryPosition(db, business.id, "MATERIAL", "hero-packaging")).onHand).toBe(4200);

      const plan = await planObjective(db, { businessId: business.id, dueAt: fridayOrder.dueAt });
      const job = await db.productionJob.findFirstOrThrow({ where: { objectiveId: objective.id } });
      const completionReply = await handleStaffSms(db, {
        businessId: business.id, userId: operator.id, role: "OPERATOR", messageId: `complete:${objective.id}`,
        text: `Job ${job.code} finished. We produced 4,000`,
      }, async () => undefined);
      expect(completionReply).toContain("Objective complete");
      expect((await db.objective.findUniqueOrThrow({ where: { id: objective.id } })).state).toBe("COMPLETE");
    } finally {
      await db.$disconnect();
    }
  });
});
