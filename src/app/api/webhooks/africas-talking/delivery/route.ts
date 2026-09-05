import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError, ApiError } from "@/lib/http";
import { safeSecretEqual } from "@/lib/crypto";
import { AfricasTalkingSmsAdapter } from "@/communications/africas-talking";
import { SimulatorSmsAdapter } from "@/communications/simulator";

async function payloadOf(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) return request.json();
  return Object.fromEntries((await request.formData()).entries());
}

export async function POST(request: Request) {
  try {
    const simulator = process.env.SMS_PROVIDER !== "africas-talking";
    const expected = simulator ? process.env.SIMULATOR_WEBHOOK_SECRET : process.env.AFRICASTALKING_WEBHOOK_SECRET;
    if (expected && !safeSecretEqual(request.headers.get("x-webhook-secret"), expected)) throw new ApiError(401, "Invalid webhook secret");
    const payload = await payloadOf(request);
    const adapter = simulator
      ? new SimulatorSmsAdapter()
      : new AfricasTalkingSmsAdapter({ username: process.env.AFRICASTALKING_USERNAME!, apiKey: process.env.AFRICASTALKING_API_KEY! });
    const update = adapter.delivery(payload);
    const status = /deliver/i.test(update.status) ? "DELIVERED" : /fail|reject/i.test(update.status) ? "FAILED" : "SENT";
    await db.externalMessage.updateMany({ where: { providerId: update.providerMessageId }, data: { status } });
    return NextResponse.json({ accepted: true });
  } catch (error) { return apiError(error); }
}
