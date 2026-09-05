import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ApiError, apiError } from "@/lib/http";
import { requireTenant } from "@/lib/tenant";
import { isDemoMode } from "@/lib/env";
import { allocateProductionMaterials, createProductionJob, planObjective, recordGoodsReceipt } from "@/domain";

export async function POST(_: Request, { params }: { params: Promise<{ purchaseOrderId: string }> }) {
  try {
    if (!isDemoMode) throw new ApiError(404, "Demo controls are disabled");
    const { businessId } = await requireTenant(["ADMIN", "OPERATOR"]);
    const { purchaseOrderId } = await params;
    const po = await db.purchaseOrder.findFirst({ where: { id: purchaseOrderId, businessId }, include: { objective: true } });
    if (!po?.objectiveId || !po.objective) throw new ApiError(404, "Purchase order not found for an objective");
    const duePurchaseOrders = await db.purchaseOrder.findMany({
      where: { businessId, status: { in: ["ISSUED", "PARTIALLY_RECEIVED"] }, expectedAt: { lte: po.expectedAt } }
    });
    const receipts = [];
    for (const duePo of duePurchaseOrders) {
      receipts.push(await recordGoodsReceipt(db, { businessId, purchaseOrderId: duePo.id, receivedAt: po.expectedAt, idempotencyKey: `demo-receipt:${duePo.id}` }));
    }
    const plan = await planObjective(db, { businessId, dueAt: po.objective.targetDueAt ?? new Date() });
    const jobs = [];
    for (const item of plan.data?.production.filter((product) => product.productionRequired > 0) ?? []) {
      const job = await createProductionJob(db, {
        businessId, objectiveId: po.objectiveId, productId: item.productId, quantity: item.productionRequired,
        scheduledAt: new Date((po.objective.targetDueAt ?? new Date()).getTime() - 2 * 86_400_000),
        idempotencyKey: `${po.objectiveId}:job:${item.productId}`
      });
      const allocation = await allocateProductionMaterials(db, { businessId, jobId: job.id, idempotencyKey: `${job.id}:allocate` });
      if (!allocation.success) throw new ApiError(409, allocation.blockingReasons[0]?.message ?? "Materials cannot be allocated");
      jobs.push(job);
    }
    await db.objectiveStep.updateMany({ where: { objectiveId: po.objectiveId, domain: "MAKE" }, data: { status: "ACTIVE", detail: `${jobs.length} production job(s) ready` } });
    await db.agentActionEvent.upsert({ where: { businessId_idempotencyKey: { businessId, idempotencyKey: `${po.objectiveId}:receipt` } }, update: {}, create: {
      businessId, objectiveId: po.objectiveId, domain: "MAKE", status: "COMPLETED", title: `${po.code} received`,
      detail: "Incoming inventory moved to available inventory", toolName: "record_goods_receipt", idempotencyKey: `${po.objectiveId}:receipt`
    } });
    return NextResponse.json({ receipts, jobs });
  } catch (error) { return apiError(error); }
}
