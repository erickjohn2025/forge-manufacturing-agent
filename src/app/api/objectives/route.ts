import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiError } from "@/lib/http";
import { requireTenant } from "@/lib/tenant";
import { enqueueObjective } from "@/agent/queue";
import { interpretObjective } from "@/agent/objective-interpreter";
import { dateAtLocalEndOfDay } from "@/lib/dates";

const createSchema = z.object({
  text: z.string().trim().min(10).max(1000),
  idempotencyKey: z.string().min(8).optional()
});

export async function GET() {
  try {
    const { businessId } = await requireTenant();
    const objectives = await db.objective.findMany({
      where: { businessId }, orderBy: { createdAt: "desc" }, take: 50,
      include: { events: { orderBy: { occurredAt: "desc" }, take: 1 } }
    });
    return NextResponse.json(objectives);
  } catch (error) { return apiError(error); }
}

export async function POST(request: NextRequest) {
  try {
    const { businessId } = await requireTenant(["ADMIN", "OPERATOR", "APPROVER"]);
    const business = await db.business.findUniqueOrThrow({ where: { id: businessId }, select: { timezone: true } });
    const input = createSchema.parse(await request.json());
    const interpreted = await interpretObjective(input.text);
    const idempotencyKey = input.idempotencyKey ?? randomUUID();
    const objective = await db.objective.upsert({
      where: { businessId_idempotencyKey: { businessId, idempotencyKey } },
      update: {},
      create: {
        businessId, text: input.text, idempotencyKey,
        targetDueAt: dateAtLocalEndOfDay(interpreted.dueDate, business.timezone), state: "PLANNING",
        steps: { create: [
          { domain: "PLAN", title: "Determine production readiness", sequence: 1, status: "ACTIVE" },
          { domain: "SOURCE", title: "Secure material shortages", sequence: 2 },
          { domain: "MAKE", title: "Coordinate production", sequence: 3 },
          { domain: "DELIVER", title: "Prepare orders for dispatch", sequence: 4 }
        ] }
      }
    });
    await enqueueObjective(objective.id);
    return NextResponse.json({ ...objective, interpretation: interpreted }, { status: 202 });
  } catch (error) { return apiError(error); }
}
