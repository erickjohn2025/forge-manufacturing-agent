import { NextResponse } from "next/server";
import { z } from "zod";
import { resetHeroScenario } from "@/domain";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { ApiError, apiError } from "@/lib/http";
import { requireTenant } from "@/lib/tenant";

const bodySchema = z.object({ confirmation: z.literal("RESET HERO") });

export async function POST(request: Request) {
  try {
    if (env.DEMO_MODE !== "true") throw new ApiError(404, "Demo reset is disabled");
    const { businessId } = await requireTenant(["ADMIN"]);
    bodySchema.parse(await request.json());
    const baseline = await resetHeroScenario(db, businessId);
    return NextResponse.json({ reset: true, baseline });
  } catch (error) {
    return apiError(error);
  }
}
