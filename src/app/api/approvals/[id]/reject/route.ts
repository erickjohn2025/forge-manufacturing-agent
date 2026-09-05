import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError } from "@/lib/http";
import { requireTenant } from "@/lib/tenant";
import { decideApproval } from "@/domain";
import { enqueueObjective } from "@/agent/queue";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const tenant = await requireTenant(["ADMIN", "APPROVER"]);
    const { id } = await params;
    const approval = await decideApproval(db, { businessId: tenant.businessId, approvalId: id, userId: tenant.userId, decision: "REJECTED" });
    if (approval.objectiveId) await enqueueObjective(approval.objectiveId);
    return NextResponse.json(approval);
  } catch (error) { return apiError(error); }
}
