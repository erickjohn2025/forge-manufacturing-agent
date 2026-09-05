import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, apiError } from "@/lib/http";
import { requireTenant } from "@/lib/tenant";
import { decideApproval } from "@/domain";
import { enqueueObjective } from "@/agent/queue";

const schema = z.object({ text: z.string().trim().min(1).max(500) });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const tenant = await requireTenant();
    const { id } = await params;
    const { text } = schema.parse(await request.json());
    const objective = await db.objective.findFirst({ where: { id, businessId: tenant.businessId } });
    if (!objective) throw new ApiError(404, "Objective not found");
    const decision = /\bapprove(?:d)?\b/i.test(text) ? "APPROVED" : /\breject(?:ed)?\b/i.test(text) ? "REJECTED" : undefined;
    if (!decision) throw new ApiError(400, "No actionable decision was found in the message");
    const approval = await db.approvalRequest.findFirst({ where: { objectiveId: id, businessId: tenant.businessId, status: "PENDING" }, orderBy: { createdAt: "asc" } });
    if (!approval) throw new ApiError(409, "There is no pending decision for this objective");
    const result = await decideApproval(db, { businessId: tenant.businessId, approvalId: approval.id, userId: tenant.userId, decision });
    await enqueueObjective(id);
    return NextResponse.json(result);
  } catch (error) { return apiError(error); }
}
