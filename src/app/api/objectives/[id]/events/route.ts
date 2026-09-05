import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ApiError, apiError } from "@/lib/http";
import { requireTenant } from "@/lib/tenant";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { businessId } = await requireTenant();
    const { id } = await params;
    const objective = await db.objective.findFirst({ where: { id, businessId }, select: { id: true } });
    if (!objective) throw new ApiError(404, "Objective not found");
    const events = await db.agentActionEvent.findMany({ where: { objectiveId: id, businessId }, orderBy: { occurredAt: "asc" } });
    return NextResponse.json(events);
  } catch (error) { return apiError(error); }
}
