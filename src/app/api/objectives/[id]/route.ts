import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ApiError, apiError } from "@/lib/http";
import { requireTenant } from "@/lib/tenant";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { businessId } = await requireTenant();
    const { id } = await params;
    const objective = await db.objective.findFirst({
      where: { id, businessId },
      include: {
        steps: { orderBy: { sequence: "asc" } },
        events: { orderBy: { occurredAt: "asc" } },
        rfqs: { include: { material: true, recipients: { include: { supplier: true } }, quotes: { include: { supplier: true } } } },
        approvals: { include: { quote: { include: { supplier: true, rfq: { include: { material: true } } } } } },
        purchaseOrders: { include: { supplier: true, payments: { orderBy: { createdAt: "desc" }, take: 1 }, lines: { include: { material: true } } } },
        productionJobs: { include: { product: true, allocations: { include: { material: true } } } }
      }
    });
    if (!objective) throw new ApiError(404, "Objective not found");
    return NextResponse.json(objective);
  } catch (error) { return apiError(error); }
}
