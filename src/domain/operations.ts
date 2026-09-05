import { Prisma, type PrismaClient } from "@prisma/client";
import type { ToolResult } from "@/lib/contracts";
import { blocked, nextBusinessCode, numberOf, ok, recordEvent } from "./shared";
import { getInventoryPosition } from "./planning";

export async function recordGoodsReceipt(
  db: PrismaClient,
  input: { businessId: string; purchaseOrderId: string; quantities?: Record<string, number>; receivedAt?: Date; idempotencyKey: string },
) {
  return db.$transaction(async (tx) => {
    const existing = await tx.goodsReceipt.findUnique({ where: { businessId_idempotencyKey: { businessId: input.businessId, idempotencyKey: input.idempotencyKey } }, include: { lines: true } });
    if (existing) return existing;
    const po = await tx.purchaseOrder.findFirstOrThrow({ where: { id: input.purchaseOrderId, businessId: input.businessId, status: { in: ["ISSUED", "PARTIALLY_RECEIVED"] } }, include: { lines: true } });
    const receiptLines = po.lines.map((line) => ({ line, quantity: input.quantities?.[line.id] ?? numberOf(line.quantity) - numberOf(line.receivedQuantity) })).filter(({ quantity }) => quantity > 0);
    if (receiptLines.length === 0) throw new Error("Receipt must contain a positive outstanding quantity");
    for (const item of receiptLines) {
      if (item.quantity > numberOf(item.line.quantity) - numberOf(item.line.receivedQuantity)) throw new Error("Receipt exceeds outstanding purchase quantity");
    }
    const receipt = await tx.goodsReceipt.create({
      data: { businessId: input.businessId, purchaseOrderId: po.id, receivedAt: input.receivedAt, idempotencyKey: input.idempotencyKey, lines: { create: receiptLines.map(({ line, quantity }) => ({ poLineId: line.id, quantity })) } },
      include: { lines: true },
    });
    for (const { line, quantity } of receiptLines) {
      await tx.purchaseOrderLine.update({ where: { id: line.id }, data: { receivedQuantity: { increment: quantity } } });
      await tx.inventoryMovement.create({ data: { businessId: input.businessId, entityKind: "MATERIAL", entityId: line.materialId, type: "RECEIPT", quantity, referenceType: "GOODS_RECEIPT", referenceId: receipt.id, idempotencyKey: `${input.idempotencyKey}:${line.id}` } });
    }
    const outstanding = po.lines.reduce((sum, line) => sum + numberOf(line.quantity) - numberOf(line.receivedQuantity), 0) - receiptLines.reduce((sum, item) => sum + item.quantity, 0);
    await tx.purchaseOrder.update({ where: { id: po.id }, data: { status: outstanding <= 0 ? "RECEIVED" : "PARTIALLY_RECEIVED" } });
    return receipt;
  });
}

export async function createProductionJob(
  db: PrismaClient,
  input: { businessId: string; objectiveId?: string; productId: string; quantity: number; scheduledAt: Date; idempotencyKey: string },
) {
  if (input.quantity <= 0) throw new Error("Production quantity must be positive");
  return db.$transaction(async (tx) => {
    const existing = await tx.productionJob.findUnique({ where: { businessId_idempotencyKey: { businessId: input.businessId, idempotencyKey: input.idempotencyKey } } });
    if (existing) return existing;
    await tx.product.findFirstOrThrow({ where: { id: input.productId, businessId: input.businessId } });
    const code = await nextBusinessCode(tx, input.businessId, "PJ");
    return tx.productionJob.create({ data: { businessId: input.businessId, objectiveId: input.objectiveId, productId: input.productId, code, plannedQuantity: input.quantity, scheduledAt: input.scheduledAt, idempotencyKey: input.idempotencyKey } });
  });
}

export async function allocateProductionMaterials(
  db: PrismaClient,
  input: { businessId: string; jobId: string; idempotencyKey: string },
): Promise<ToolResult<{ jobId: string; allocations: Array<{ materialId: string; quantity: number }> }>> {
  const job = await db.productionJob.findFirstOrThrow({ where: { id: input.jobId, businessId: input.businessId }, include: { product: { include: { bom: { include: { lines: true } } } }, allocations: true } });
  if (job.allocations.length > 0) return ok({ jobId: job.id, allocations: job.allocations.map((a) => ({ materialId: a.materialId, quantity: numberOf(a.quantity) })) });
  if (!job.product.bom?.active) return blocked("BOM_MISSING", "Production job product has no active BOM");
  const requirements = job.product.bom.lines.map((line) => ({ materialId: line.materialId, quantity: numberOf(line.quantityPerUnit) * numberOf(job.plannedQuantity) }));
  for (const requirement of requirements) {
    const position = await getInventoryPosition(db, input.businessId, "MATERIAL", requirement.materialId);
    if (position.available < requirement.quantity) return blocked("INSUFFICIENT_MATERIAL", `Insufficient material ${requirement.materialId}`);
  }
  await db.$transaction(async (tx) => {
    for (const requirement of requirements) {
      const reservation = await tx.inventoryReservation.create({ data: { businessId: input.businessId, entityKind: "MATERIAL", entityId: requirement.materialId, quantity: requirement.quantity, referenceType: "PRODUCTION_JOB", referenceId: job.id, idempotencyKey: `${input.idempotencyKey}:${requirement.materialId}` } });
      await tx.productionMaterialAllocation.create({ data: { jobId: job.id, materialId: requirement.materialId, quantity: requirement.quantity, reservationId: reservation.id } });
    }
    await tx.productionJob.update({ where: { id: job.id }, data: { status: "READY" } });
  });
  return ok({ jobId: job.id, allocations: requirements }, ["Production materials reserved"]);
}

export async function recordProductionCompletion(
  db: PrismaClient,
  input: { businessId: string; jobId: string; actualQuantity: number; idempotencyKey: string },
) {
  if (input.actualQuantity <= 0) throw new Error("Actual production quantity must be positive");
  return db.$transaction(async (tx) => {
    const existing = await tx.inventoryMovement.findUnique({ where: { businessId_idempotencyKey: { businessId: input.businessId, idempotencyKey: `${input.idempotencyKey}:output` } } });
    const job = await tx.productionJob.findFirstOrThrow({ where: { id: input.jobId, businessId: input.businessId }, include: { allocations: true } });
    if (existing) return job;
    if (!['READY', 'IN_PROGRESS'].includes(job.status)) throw new Error("Production job is not ready for completion");
    for (const allocation of job.allocations) {
      await tx.inventoryReservation.update({ where: { id: allocation.reservationId }, data: { status: "CONSUMED" } });
      await tx.inventoryMovement.create({ data: { businessId: input.businessId, entityKind: "MATERIAL", entityId: allocation.materialId, type: "CONSUMPTION", quantity: -numberOf(allocation.quantity), referenceType: "PRODUCTION_JOB", referenceId: job.id, idempotencyKey: `${input.idempotencyKey}:consume:${allocation.materialId}` } });
    }
    await tx.inventoryMovement.create({ data: { businessId: input.businessId, entityKind: "PRODUCT", entityId: job.productId, type: "PRODUCTION", quantity: input.actualQuantity, referenceType: "PRODUCTION_JOB", referenceId: job.id, idempotencyKey: `${input.idempotencyKey}:output` } });
    return tx.productionJob.update({ where: { id: job.id }, data: { status: "COMPLETE", actualQuantity: input.actualQuantity } });
  });
}

export async function allocateFinishedGoods(
  db: PrismaClient,
  input: { businessId: string; orderIds: string[]; idempotencyKey: string },
): Promise<ToolResult<{ allocatedOrderIds: string[] }>> {
  const orders = await db.customerOrder.findMany({ where: { id: { in: input.orderIds }, businessId: input.businessId, status: { in: ["CONFIRMED", "ALLOCATED"] } }, include: { lines: true }, orderBy: [{ dueAt: "asc" }, { createdAt: "asc" }] });
  if (orders.length !== new Set(input.orderIds).size) return blocked("ORDER_SCOPE_INVALID", "One or more orders are unavailable in this business");
  const result = await db.$transaction(async (tx) => {
    const productIds = [...new Set(orders.flatMap((order) => order.lines.map((line) => line.productId)))].sort();
    for (const productId of productIds) {
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`${input.businessId}:${productId}`}))`);
    }
    const availability = new Map<string, number>();
    for (const productId of productIds) availability.set(productId, (await getInventoryPosition(tx, input.businessId, "PRODUCT", productId)).available);
    for (const order of orders) for (const line of order.lines) {
      const needed = numberOf(line.quantity) - numberOf(line.allocatedQuantity);
      if ((availability.get(line.productId) ?? 0) < needed) return { blockedOrderCode: order.code };
      availability.set(line.productId, (availability.get(line.productId) ?? 0) - needed);
    }
    for (const order of orders) {
      for (const line of order.lines) {
        const needed = numberOf(line.quantity) - numberOf(line.allocatedQuantity);
        if (needed <= 0) continue;
        await tx.inventoryReservation.create({ data: { businessId: input.businessId, entityKind: "PRODUCT", entityId: line.productId, quantity: needed, referenceType: "CUSTOMER_ORDER", referenceId: order.id, idempotencyKey: `${input.idempotencyKey}:${line.id}` } });
        await tx.customerOrderLine.update({ where: { id: line.id }, data: { allocatedQuantity: { increment: needed } } });
      }
      await tx.customerOrder.update({ where: { id: order.id }, data: { status: "ALLOCATED" } });
    }
    return { blockedOrderCode: undefined };
  });
  if (result.blockedOrderCode) return blocked("INSUFFICIENT_FINISHED_GOODS", `Insufficient finished goods for order ${result.blockedOrderCode}`);
  return ok({ allocatedOrderIds: orders.map((order) => order.id) }, [`${orders.length} orders allocated`]);
}

export async function markOrdersReady(db: PrismaClient, businessId: string, orderIds: string[]) {
  const orders = await db.customerOrder.findMany({ where: { businessId, id: { in: orderIds }, status: "ALLOCATED" }, include: { lines: true } });
  const ready = orders.filter((order) => order.lines.every((line) => numberOf(line.allocatedQuantity) >= numberOf(line.quantity)));
  await db.customerOrder.updateMany({ where: { businessId, id: { in: ready.map((order) => order.id) } }, data: { status: "READY_FOR_DISPATCH" } });
  return ready.map((order) => order.id);
}

export async function verifyObjectiveCompletion(
  db: PrismaClient,
  input: { businessId: string; objectiveId: string; orderIds: string[]; idempotencyKey: string },
): Promise<ToolResult<{ complete: boolean; readyOrderCount: number }>> {
  const objective = await db.objective.findFirst({ where: { id: input.objectiveId, businessId: input.businessId } });
  if (!objective) return blocked("OBJECTIVE_NOT_FOUND", "Objective is unavailable in this business", { complete: false, readyOrderCount: 0 });
  const readyOrderCount = await db.customerOrder.count({ where: { businessId: input.businessId, id: { in: input.orderIds }, status: "READY_FOR_DISPATCH" } });
  if (readyOrderCount !== new Set(input.orderIds).size) return blocked("ORDERS_NOT_READY", "Not all target orders are ready for dispatch", { complete: false, readyOrderCount });
  const eventId = await db.$transaction(async (tx) => {
    await tx.objective.updateMany({ where: { id: input.objectiveId, businessId: input.businessId }, data: { state: "COMPLETE", completedAt: new Date() } });
    return recordEvent(tx, { businessId: input.businessId, objectiveId: input.objectiveId, domain: "DELIVER", status: "COMPLETED", title: "All target orders are ready for fulfilment", toolName: "complete_objective", idempotencyKey: input.idempotencyKey });
  });
  return { ...ok({ complete: true, readyOrderCount }, ["Objective complete"], [eventId]), nextObjectiveState: "COMPLETE" };
}

export const completeObjective = verifyObjectiveCompletion;
