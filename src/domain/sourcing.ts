import { createHash } from "node:crypto";
import { Prisma, type PrismaClient, type Role } from "@prisma/client";
import type { ToolResult } from "@/lib/contracts";
import { blocked, nextBusinessCode, numberOf, ok, recordEvent } from "./shared";

export async function getApprovedSuppliers(db: PrismaClient, businessId: string, materialId: string) {
  return db.supplier.findMany({
    where: { businessId, approved: true, materials: { some: { materialId, active: true } } },
    include: { materials: { where: { materialId } } },
    orderBy: [{ preferred: "desc" }, { reliability: "desc" }],
  });
}

export async function createRfq(
  db: PrismaClient,
  input: { businessId: string; objectiveId?: string; materialId: string; quantity: number; requiredAt: Date; responseDueAt: Date; supplierIds: string[]; idempotencyKey: string },
) {
  if (input.quantity <= 0) throw new Error("RFQ quantity must be positive");
  if (input.responseDueAt > input.requiredAt) throw new Error("RFQ response deadline must not be after the requirement date");
  return db.$transaction(async (tx) => {
    const existingEvent = await tx.agentActionEvent.findUnique({
      where: { businessId_idempotencyKey: { businessId: input.businessId, idempotencyKey: input.idempotencyKey } },
    });
    if (existingEvent?.payload && typeof existingEvent.payload === "object" && "rfqId" in existingEvent.payload) {
      return tx.rfq.findUniqueOrThrow({ where: { id: String(existingEvent.payload.rfqId) }, include: { recipients: true } });
    }
    const material = await tx.material.findFirstOrThrow({ where: { id: input.materialId, businessId: input.businessId } });
    const suppliers = await tx.supplier.findMany({ where: { id: { in: input.supplierIds }, businessId: input.businessId, approved: true } });
    if (suppliers.length !== new Set(input.supplierIds).size) throw new Error("Every RFQ recipient must be an approved supplier in this business");
    const code = await nextBusinessCode(tx, input.businessId, "RFQ");
    const rfq = await tx.rfq.create({
      data: {
        businessId: input.businessId,
        objectiveId: input.objectiveId,
        materialId: input.materialId,
        code,
        quantity: input.quantity,
        requiredAt: input.requiredAt,
        responseDueAt: input.responseDueAt,
        recipients: { create: suppliers.map((supplier) => ({ supplierId: supplier.id })) },
      },
      include: { recipients: true },
    });
    await recordEvent(tx, {
      businessId: input.businessId, objectiveId: input.objectiveId, domain: "SOURCE", status: "COMPLETED",
      title: `Created ${code}`, detail: `${input.quantity} ${material.unit} of ${material.name}`,
      toolName: "create_rfq", payload: { rfqId: rfq.id }, idempotencyKey: input.idempotencyKey,
    });
    return rfq;
  });
}

export async function recordSupplierResponse(
  db: PrismaClient,
  input: { businessId: string; rfqId: string; supplierId: string; unitPrice: number; currency: string; quantityAvailable: number; deliveryAt: Date; rawMessageId?: string },
) {
  if (input.unitPrice <= 0 || input.quantityAvailable <= 0) throw new Error("Quote price and quantity must be positive");
  const [rfq, supplier] = await Promise.all([
    db.rfq.findFirstOrThrow({ where: { id: input.rfqId, businessId: input.businessId, status: { in: ["SENT", "QUOTING"] } } }),
    db.supplier.findFirstOrThrow({ where: { id: input.supplierId, businessId: input.businessId } }),
  ]);
  await db.rfqRecipient.findUniqueOrThrow({ where: { rfqId_supplierId: { rfqId: rfq.id, supplierId: supplier.id } } });
  const quote = await db.supplierQuote.upsert({
    where: { rfqId_supplierId: { rfqId: rfq.id, supplierId: supplier.id } },
    create: { businessId: input.businessId, rfqId: rfq.id, supplierId: supplier.id, unitPrice: input.unitPrice, currency: input.currency, quantityAvailable: input.quantityAvailable, deliveryAt: input.deliveryAt, rawMessageId: input.rawMessageId },
    update: { unitPrice: input.unitPrice, currency: input.currency, quantityAvailable: input.quantityAvailable, deliveryAt: input.deliveryAt, rawMessageId: input.rawMessageId, status: "RECEIVED", rejectionCode: null, rejectionReason: null },
  });
  await db.rfq.update({ where: { id: rfq.id }, data: { status: "QUOTING" } });
  return quote;
}

export type QuoteEvaluation = {
  eligible: Array<{ quoteId: string; supplierId: string; supplierName: string; total: number; deliveryAt: Date; reliability: number; quality: number; preferred: boolean }>;
  rejected: Array<{ quoteId: string; supplierId: string; supplierName: string; code: string; reason: string }>;
  selectedQuoteId?: string;
};

export async function evaluateSupplierQuotes(
  db: PrismaClient,
  input: { businessId: string; rfqId: string },
): Promise<ToolResult<QuoteEvaluation>> {
  const rfq = await db.rfq.findFirstOrThrow({
    where: { id: input.rfqId, businessId: input.businessId },
    include: { business: true, material: true, quotes: { include: { supplier: { include: { materials: true } } } } },
  });
  const eligible: QuoteEvaluation["eligible"] = [];
  const rejected: QuoteEvaluation["rejected"] = [];
  for (const quote of rfq.quotes) {
    const capability = quote.supplier.materials.find((item) => item.materialId === rfq.materialId && item.active);
    let rejection: { code: string; reason: string } | undefined;
    if (!quote.supplier.approved) rejection = { code: "SUPPLIER_NOT_APPROVED", reason: "Supplier is not approved" };
    else if (!capability) rejection = { code: "MATERIAL_MISMATCH", reason: "Supplier is not approved for this material" };
    else if (rfq.material.specification && capability.specification !== rfq.material.specification) rejection = { code: "SPECIFICATION_MISMATCH", reason: "Supplier capability does not match the required material specification" };
    else if (numberOf(quote.quantityAvailable) < numberOf(rfq.quantity)) rejection = { code: "INSUFFICIENT_QUANTITY", reason: "Available quantity is below the RFQ requirement" };
    else if (numberOf(rfq.quantity) < numberOf(capability.minimumOrder)) rejection = { code: "MOQ_NOT_MET", reason: "RFQ quantity is below the supplier minimum order" };
    else if (quote.deliveryAt > rfq.requiredAt) rejection = { code: "DELIVERY_TOO_LATE", reason: "Delivery is after the material requirement date" };
    else if (quote.currency !== rfq.business.currency) rejection = { code: "CURRENCY_NOT_ALLOWED", reason: `Quote must use ${rfq.business.currency}` };
    if (rejection) {
      rejected.push({ quoteId: quote.id, supplierId: quote.supplierId, supplierName: quote.supplier.name, ...rejection });
    } else {
      eligible.push({
        quoteId: quote.id,
        supplierId: quote.supplierId,
        supplierName: quote.supplier.name,
        total: numberOf(quote.unitPrice) * numberOf(rfq.quantity),
        deliveryAt: quote.deliveryAt,
        reliability: numberOf(quote.supplier.reliability),
        quality: numberOf(quote.supplier.quality),
        preferred: quote.supplier.preferred,
      });
    }
  }
  eligible.sort((a, b) =>
    a.total - b.total
    || a.deliveryAt.getTime() - b.deliveryAt.getTime()
    || b.reliability - a.reliability
    || b.quality - a.quality
    || Number(b.preferred) - Number(a.preferred),
  );
  const selectedQuoteId = eligible[0]?.quoteId;
  await db.$transaction([
    ...rejected.map((item) => db.supplierQuote.update({ where: { id: item.quoteId }, data: { status: "REJECTED", rejectionCode: item.code, rejectionReason: item.reason } })),
    ...eligible.map((item) => db.supplierQuote.update({ where: { id: item.quoteId }, data: { status: item.quoteId === selectedQuoteId ? "SELECTED" : "ELIGIBLE", rejectionCode: null, rejectionReason: null } })),
    db.rfq.update({ where: { id: rfq.id }, data: { status: "EVALUATED" } }),
  ]);
  const result = { eligible, rejected, selectedQuoteId };
  return selectedQuoteId ? ok(result, [`${eligible.length} eligible quotes`, `${rejected.length} quotes rejected`]) : blocked("NO_ELIGIBLE_QUOTES", "No quotation satisfies the hard constraints", result);
}

export function purchasePayloadHash(input: { supplierId: string; materialId: string; quantity: number; unitPrice: number; currency: string; deliveryAt: Date }): string {
  return createHash("sha256").update(JSON.stringify({ ...input, deliveryAt: input.deliveryAt.toISOString() })).digest("hex");
}

export async function requestPurchaseApproval(
  db: PrismaClient,
  input: { businessId: string; objectiveId?: string; quoteId: string },
) {
  const quote = await db.supplierQuote.findFirstOrThrow({ where: { id: input.quoteId, businessId: input.businessId }, include: { rfq: true } });
  const quantity = numberOf(quote.rfq.quantity);
  const total = quote.unitPrice.mul(quote.rfq.quantity);
  const payloadHash = purchasePayloadHash({ supplierId: quote.supplierId, materialId: quote.rfq.materialId, quantity, unitPrice: numberOf(quote.unitPrice), currency: quote.currency, deliveryAt: quote.deliveryAt });
  const approval = await db.approvalRequest.upsert({
    where: { quoteId: quote.id },
    create: { businessId: input.businessId, objectiveId: input.objectiveId, quoteId: quote.id, payloadHash, total, currency: quote.currency },
    update: {},
  });
  if (input.objectiveId) await db.objective.updateMany({ where: { id: input.objectiveId, businessId: input.businessId }, data: { state: "WAITING_APPROVAL" } });
  return approval;
}

export async function decideApproval(
  db: PrismaClient,
  input: { businessId: string; approvalId: string; userId: string; decision: "APPROVED" | "REJECTED" },
) {
  const membership = await db.businessMembership.findUnique({ where: { userId_businessId: { userId: input.userId, businessId: input.businessId } } });
  const allowed: Role[] = ["ADMIN", "APPROVER"];
  if (!membership || !allowed.includes(membership.role)) throw new Error("Approval authority required");
  const approval = await db.approvalRequest.findFirstOrThrow({ where: { id: input.approvalId, businessId: input.businessId }, include: { quote: { include: { rfq: true } } } });
  const currentHash = purchasePayloadHash({ supplierId: approval.quote.supplierId, materialId: approval.quote.rfq.materialId, quantity: numberOf(approval.quote.rfq.quantity), unitPrice: numberOf(approval.quote.unitPrice), currency: approval.quote.currency, deliveryAt: approval.quote.deliveryAt });
  if (currentHash !== approval.payloadHash) return db.approvalRequest.update({ where: { id: approval.id }, data: { status: "STALE", decidedAt: new Date() } });
  if (approval.status !== "PENDING") return approval;
  return db.approvalRequest.update({ where: { id: approval.id }, data: { status: input.decision, approvedById: input.userId, decidedAt: new Date() } });
}

export async function createPurchaseOrder(
  db: PrismaClient,
  input: { businessId: string; objectiveId?: string; quoteId: string; idempotencyKey: string },
) {
  return db.$transaction(async (tx) => {
    const existing = await tx.purchaseOrder.findUnique({ where: { businessId_idempotencyKey: { businessId: input.businessId, idempotencyKey: input.idempotencyKey } }, include: { lines: true } });
    if (existing) return existing;
    const [business, quote] = await Promise.all([
      tx.business.findUniqueOrThrow({ where: { id: input.businessId } }),
      tx.supplierQuote.findFirstOrThrow({ where: { id: input.quoteId, businessId: input.businessId, status: "SELECTED" }, include: { rfq: true, approval: true } }),
    ]);
    const quantity = numberOf(quote.rfq.quantity);
    const total = quote.unitPrice.mul(quote.rfq.quantity);
    if (total.gt(business.autoPurchaseLimit) && quote.approval?.status !== "APPROVED") throw new Error("Approved purchase authorization required");
    if (quote.approval) {
      const currentHash = purchasePayloadHash({ supplierId: quote.supplierId, materialId: quote.rfq.materialId, quantity, unitPrice: numberOf(quote.unitPrice), currency: quote.currency, deliveryAt: quote.deliveryAt });
      if (currentHash !== quote.approval.payloadHash) throw new Error("Purchase approval is stale");
    }
    const code = await nextBusinessCode(tx, input.businessId, "PO");
    return tx.purchaseOrder.create({
      data: {
        businessId: input.businessId, objectiveId: input.objectiveId, supplierId: quote.supplierId, quoteId: quote.id,
        code, currency: quote.currency, total, expectedAt: quote.deliveryAt, status: "ISSUED", idempotencyKey: input.idempotencyKey,
        lines: { create: { materialId: quote.rfq.materialId, quantity, unitPrice: quote.unitPrice } },
      },
      include: { lines: true },
    });
  });
}
