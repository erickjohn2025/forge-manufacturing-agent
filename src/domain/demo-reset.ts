import type { PrismaClient } from "@prisma/client";
import { dateAtLocalNoon, nextWeekday } from "@/lib/dates";
import { logInfo } from "@/lib/logger";

export async function resetHeroScenario(db: PrismaClient, businessId: string, options: { preserveMessageId?: string } = {}) {
  const business = await db.business.findUniqueOrThrow({ where: { id: businessId }, select: { timezone: true } });
  const [product, ingredient, packaging, labels, customer, supplier] = await Promise.all([
    db.product.findFirstOrThrow({ where: { businessId, sku: "PROD-A" }, select: { id: true } }),
    db.material.findFirstOrThrow({ where: { businessId, sku: "ING-A" }, select: { id: true } }),
    db.material.findFirstOrThrow({ where: { businessId, sku: "PACK" }, select: { id: true } }),
    db.material.findFirstOrThrow({ where: { businessId, sku: "LABEL" }, select: { id: true } }),
    db.customer.findFirstOrThrow({ where: { businessId, code: "CUST-001" }, select: { id: true } }),
    db.supplier.findFirstOrThrow({ where: { businessId, code: "SUP-A" }, select: { id: true } }),
  ]);
  const fridayDate = nextWeekday("friday").toISOString().slice(0, 10);
  const friday = dateAtLocalNoon(fridayDate, business.timezone);
  const monday = new Date(friday.getTime() - 4 * 86_400_000);
  logInfo("demo.reset.started", { businessId, timezone: business.timezone, fridayDueAt: friday.toISOString(), incomingExpectedAt: monday.toISOString() });

  await db.$transaction(async (tx) => {
    await tx.objectiveStep.deleteMany({ where: { objective: { businessId } } });
    await tx.approvalRequest.deleteMany({ where: { businessId } });
    await tx.goodsReceiptLine.deleteMany({ where: { goodsReceipt: { businessId } } });
    await tx.goodsReceipt.deleteMany({ where: { businessId } });
    await tx.purchaseOrderLine.deleteMany({ where: { purchaseOrder: { businessId } } });
    await tx.purchaseOrder.deleteMany({ where: { businessId } });
    await tx.supplierQuote.deleteMany({ where: { businessId } });
    await tx.rfqRecipient.deleteMany({ where: { rfq: { businessId } } });
    await tx.rfq.deleteMany({ where: { businessId } });
    await tx.productionMaterialAllocation.deleteMany({ where: { job: { businessId } } });
    await tx.productionJob.deleteMany({ where: { businessId } });
    await tx.inventoryReservation.deleteMany({ where: { businessId } });
    await tx.inventoryMovement.deleteMany({ where: { businessId } });
    await tx.customerOrderLine.deleteMany({ where: { order: { businessId } } });
    await tx.customerOrder.deleteMany({ where: { businessId } });
    await tx.agentActionEvent.deleteMany({ where: { businessId } });
    await tx.externalMessage.deleteMany({ where: { businessId, ...(options.preserveMessageId ? { id: { not: options.preserveMessageId } } : {}) } });
    await tx.objective.deleteMany({ where: { businessId } });

    await Promise.all([
      tx.businessSequence.upsert({ where: { businessId_key: { businessId, key: "RFQ" } }, update: { nextValue: 104 }, create: { businessId, key: "RFQ", nextValue: 104 } }),
      tx.businessSequence.upsert({ where: { businessId_key: { businessId, key: "PO" } }, update: { nextValue: 204 }, create: { businessId, key: "PO", nextValue: 204 } }),
      tx.businessSequence.upsert({ where: { businessId_key: { businessId, key: "PJ" } }, update: { nextValue: 301 }, create: { businessId, key: "PJ", nextValue: 301 } }),
    ]);

    const orders = await Promise.all([
      tx.customerOrder.create({ data: { businessId, customerId: customer.id, code: "ORD-101", dueAt: friday } }),
      tx.customerOrder.create({ data: { businessId, customerId: customer.id, code: "ORD-102", dueAt: friday } }),
      tx.customerOrder.create({ data: { businessId, customerId: customer.id, code: "ORD-103", dueAt: friday } }),
    ]);
    await tx.customerOrderLine.createMany({ data: [
      { orderId: orders[0].id, productId: product.id, quantity: 2_000 },
      { orderId: orders[1].id, productId: product.id, quantity: 1_500 },
      { orderId: orders[2].id, productId: product.id, quantity: 1_500 },
    ] });
    await tx.inventoryMovement.createMany({ data: [
      { businessId, entityKind: "PRODUCT", entityId: product.id, type: "ADJUSTMENT", quantity: 1_000, referenceType: "DEMO_RESET", idempotencyKey: "demo-reset:fg" },
      { businessId, entityKind: "MATERIAL", entityId: ingredient.id, type: "ADJUSTMENT", quantity: 400, referenceType: "DEMO_RESET", idempotencyKey: "demo-reset:ingredient" },
      { businessId, entityKind: "MATERIAL", entityId: packaging.id, type: "ADJUSTMENT", quantity: 2_400, referenceType: "DEMO_RESET", idempotencyKey: "demo-reset:packaging" },
      { businessId, entityKind: "MATERIAL", entityId: labels.id, type: "ADJUSTMENT", quantity: 4_000, referenceType: "DEMO_RESET", idempotencyKey: "demo-reset:labels" },
    ] });
    await tx.purchaseOrder.create({ data: {
      businessId, supplierId: supplier.id, code: "PO-203", currency: "TZS", total: 220_000,
      expectedAt: monday, status: "ISSUED", idempotencyKey: "demo-reset:incoming-po",
      lines: { create: { materialId: packaging.id, quantity: 400, unitPrice: 550 } },
    } });
  });

  const baseline = { orders: 3, demand: 5_000, finishedGoods: 1_000, productionRequired: 4_000, packagingShortage: 1_400 };
  logInfo("demo.reset.completed", { businessId, ...baseline });
  return baseline;
}
