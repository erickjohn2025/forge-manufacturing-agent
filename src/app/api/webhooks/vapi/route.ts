import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ApiError, apiError } from "@/lib/http";
import { parseVapiWebhook } from "@/communications/vapi";
import { verifyVapiWebhook } from "@/communications/webhook-security";
import { stableHash } from "@/lib/crypto";

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const secret = process.env.VAPI_WEBHOOK_SECRET;
    if (!secret || !verifyVapiWebhook({
      rawBody, expectedSecret: secret, authorization: request.headers.get("authorization"),
      secretHeader: request.headers.get("x-vapi-secret"), signature: request.headers.get("x-vapi-signature")
    })) throw new ApiError(401, "Invalid Vapi webhook signature");
    const parsed = parseVapiWebhook(JSON.parse(rawBody));
    const results: Array<{ toolCallId: string; result: string }> = [];
    for (const call of parsed.message.toolCallList ?? []) {
      const args = (call.arguments && typeof call.arguments === "object" ? call.arguments : {}) as Record<string, unknown>;
      if (call.name !== "get_objective_status" || typeof args.objectiveId !== "string") {
        results.push({ toolCallId: call.id, result: JSON.stringify({ error: "Only the read-only get_objective_status tool is enabled" }) });
        continue;
      }
      const objective = await db.objective.findUnique({ where: { id: args.objectiveId }, include: { events: { orderBy: { occurredAt: "desc" }, take: 5 } } });
      results.push({ toolCallId: call.id, result: JSON.stringify(objective ? { state: objective.state, objective: objective.text, recentEvents: objective.events.map((event) => event.title) } : { error: "Objective not found" }) });
      if (objective && parsed.message.transcript) {
        const fingerprint = `vapi:${parsed.message.call?.id ?? "unknown"}:${stableHash(parsed.message.transcript)}`;
        await db.externalMessage.upsert({ where: { businessId_fingerprint: { businessId: objective.businessId, fingerprint } }, update: {}, create: {
          businessId: objective.businessId, direction: "INBOUND", channel: "VOICE", status: "RECEIVED",
          fromAddress: parsed.message.call?.id ?? "vapi", toAddress: "agent", body: parsed.message.transcript, fingerprint,
          providerPayload: JSON.parse(rawBody)
        } });
      }
    }
    return NextResponse.json(results.length ? { results } : { received: true });
  } catch (error) { return apiError(error); }
}
