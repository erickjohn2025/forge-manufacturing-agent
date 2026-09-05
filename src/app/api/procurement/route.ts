import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiError } from "@/lib/http";
import { requireTenant } from "@/lib/tenant";
import { numberOf } from "@/domain/shared";

const rfqStatuses = ["DRAFT", "SENT", "QUOTING", "EVALUATED", "CLOSED", "CANCELLED"] as const;
const poStatuses = ["DRAFT", "ISSUED", "PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED"] as const;
const querySchema = z.object({
  status: z.string().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const { businessId } = await requireTenant();
    const { status } = querySchema.parse({ status: request.nextUrl.searchParams.get("status") ?? undefined });
    const rfqStatus = status && rfqStatuses.includes(status as typeof rfqStatuses[number]) ? status as typeof rfqStatuses[number] : undefined;
    const poStatus = status && poStatuses.includes(status as typeof poStatuses[number]) ? status as typeof poStatuses[number] : undefined;
    const statusUnknown = Boolean(status && !rfqStatus && !poStatus);
    const [rfqs, purchaseOrders, receipts] = statusUnknown ? [[], [], []] : await Promise.all([
      !status || rfqStatus ? db.rfq.findMany({
        where: { businessId, ...(rfqStatus ? { status: rfqStatus } : {}) },
        include: { material: true, recipients: { include: { supplier: true } }, quotes: { include: { supplier: true } } },
        orderBy: { createdAt: "desc" },
      }) : Promise.resolve([]),
      !status || poStatus ? db.purchaseOrder.findMany({
        where: { businessId, ...(poStatus ? { status: poStatus } : {}) },
        include: { supplier: true, lines: { include: { material: true } } },
        orderBy: { createdAt: "desc" },
      }) : Promise.resolve([]),
      !status || poStatus ? db.goodsReceipt.findMany({
        where: { businessId, ...(poStatus ? { purchaseOrder: { status: poStatus } } : {}) },
        include: { purchaseOrder: true, lines: true },
        orderBy: { receivedAt: "desc" },
      }) : Promise.resolve([]),
    ]);

    return NextResponse.json({
      rfqs: rfqs.map((rfq) => ({
        id: rfq.id, code: rfq.code, materialName: rfq.material.name, quantity: numberOf(rfq.quantity),
        status: rfq.status, requiredAt: rfq.requiredAt.toISOString(),
        recipients: rfq.recipients.map((recipient) => ({ supplierName: recipient.supplier.name, sentAt: recipient.sentAt?.toISOString() })),
        quotes: rfq.quotes.map((quote) => ({
          id: quote.id, supplierName: quote.supplier.name, unitPrice: numberOf(quote.unitPrice), currency: quote.currency,
          quantityAvailable: numberOf(quote.quantityAvailable), deliveryDate: quote.deliveryAt.toISOString(),
          status: quote.status, eligible: quote.status !== "REJECTED", rejectionReason: quote.rejectionReason ?? undefined,
        })),
      })),
      purchaseOrders: purchaseOrders.map((po) => ({
        id: po.id, code: po.code, supplierName: po.supplier.name, status: po.status, currency: po.currency,
        total: numberOf(po.total), expectedAt: po.expectedAt.toISOString(),
        lines: po.lines.map((line) => ({
          id: line.id, materialName: line.material.name, quantity: numberOf(line.quantity),
          receivedQuantity: numberOf(line.receivedQuantity), unitPrice: numberOf(line.unitPrice),
        })),
      })),
      receipts: receipts.map((receipt) => ({
        id: receipt.id, purchaseOrderCode: receipt.purchaseOrder.code, receivedAt: receipt.receivedAt.toISOString(),
        quantity: receipt.lines.reduce((sum, line) => sum + numberOf(line.quantity), 0),
      })),
    });
  } catch (error) { return apiError(error); }
}
