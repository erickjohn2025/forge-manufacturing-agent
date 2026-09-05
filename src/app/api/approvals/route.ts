import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError } from "@/lib/http";
import { requireTenant } from "@/lib/tenant";
import { numberOf } from "@/domain/shared";

export async function GET() {
  try {
    const { businessId } = await requireTenant();
    const approvals = await db.approvalRequest.findMany({
      where: { businessId, status: "PENDING" },
      include: { quote: { include: { supplier: true, rfq: { include: { material: true } } } }, objective: true },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(approvals.map((approval) => ({
      id: approval.id,
      supplierName: approval.quote.supplier.name,
      materialName: approval.quote.rfq.material.name,
      quantity: numberOf(approval.quote.rfq.quantity),
      unitPrice: numberOf(approval.quote.unitPrice),
      total: numberOf(approval.total),
      currency: approval.currency,
      deliveryDate: approval.quote.deliveryAt.toISOString(),
      reason: approval.quote.rejectionReason || "Lowest-cost approved supplier capable of meeting the production deadline.",
      status: approval.status,
      objectiveId: approval.objectiveId ?? undefined,
      objectiveText: approval.objective?.text,
    })));
  } catch (error) { return apiError(error); }
}
