import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ApiError, apiError } from "@/lib/http";
import { requireTenant } from "@/lib/tenant";
import { isDemoMode } from "@/lib/env";
import { allocateFinishedGoods, markOrdersReady, planObjective, recordProductionCompletion, verifyObjectiveCompletion } from "@/domain";

export async function POST(_: Request, { params }: { params: Promise<{ jobId: string }> }) {
  try {
    if (!isDemoMode) throw new ApiError(404, "Demo controls are disabled");
    const { businessId } = await requireTenant(["ADMIN", "OPERATOR"]);
    const { jobId } = await params;
    const job = await db.productionJob.findFirst({ where: { id: jobId, businessId }, include: { objective: true } });
    if (!job?.objectiveId || !job.objective) throw new ApiError(404, "Production job not found for an objective");
    const completedJob = await recordProductionCompletion(db, { businessId, jobId, actualQuantity: Number(job.plannedQuantity), idempotencyKey: `demo-complete:${jobId}` });
    await db.agentActionEvent.upsert({ where: { businessId_idempotencyKey: { businessId, idempotencyKey: `${job.objectiveId}:production:${jobId}` } }, update: {}, create: {
      businessId, objectiveId: job.objectiveId, domain: "MAKE", status: "COMPLETED", title: `${job.code} completed`,
      detail: `${Number(job.plannedQuantity).toLocaleString()} finished units added`, toolName: "record_production_completion", idempotencyKey: `${job.objectiveId}:production:${jobId}`
    } });
    const unfinished = await db.productionJob.count({ where: { objectiveId: job.objectiveId, businessId, status: { not: "COMPLETE" } } });
    if (unfinished) return NextResponse.json({ job: completedJob, waitingForJobs: unfinished });
    const plan = await planObjective(db, { businessId, dueAt: job.objective.targetDueAt ?? new Date() });
    const orderIds = plan.data?.orderIds ?? [];
    const allocation = await allocateFinishedGoods(db, { businessId, orderIds, idempotencyKey: `${job.objectiveId}:finished-goods` });
    if (!allocation.success) throw new ApiError(409, allocation.blockingReasons[0]?.message ?? "Finished goods cannot be allocated");
    await markOrdersReady(db, businessId, orderIds);
    await db.objectiveStep.updateMany({ where: { objectiveId: job.objectiveId, domain: "MAKE" }, data: { status: "COMPLETED", detail: "Production completed and inventory updated" } });
    await db.objectiveStep.updateMany({ where: { objectiveId: job.objectiveId, domain: "DELIVER" }, data: { status: "COMPLETED", detail: `${orderIds.length} orders ready for dispatch` } });
    const completion = await verifyObjectiveCompletion(db, { businessId, objectiveId: job.objectiveId, orderIds, idempotencyKey: `${job.objectiveId}:complete` });
    return NextResponse.json({ job: completedJob, allocation, completion });
  } catch (error) { return apiError(error); }
}
