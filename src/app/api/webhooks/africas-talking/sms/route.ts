import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError, ApiError } from "@/lib/http";
import { safeSecretEqual } from "@/lib/crypto";
import { AfricasTalkingSmsAdapter } from "@/communications/africas-talking";
import { SimulatorSmsAdapter } from "@/communications/simulator";
import { smsPayloadFingerprint } from "@/communications/normalization";
import { getMessagingAdapter } from "@/communications/factory";
import { SupplierQuoteExtractor } from "@/agent/quote-extractor";
import { recordSupplierResponse } from "@/domain";
import { enqueueObjective } from "@/agent/queue";
import { handleStaffSms } from "@/agent/sms-operations";

async function sendReply(input: { businessId: string; from: string; to: string; body: string; fingerprint: string; simulator: boolean }) {
  const receipt = await getMessagingAdapter().send({ businessId: input.businessId, from: input.from, to: [input.to], message: input.body, idempotencyKey: input.fingerprint });
  const recipient = receipt.recipients[0];
  const accepted = Boolean(recipient?.providerMessageId && recipient.providerMessageId !== "None" && /success|sent|queued/i.test(recipient.status));
  await db.externalMessage.upsert({
    where: { businessId_fingerprint: { businessId: input.businessId, fingerprint: input.fingerprint } },
    update: {
      status: accepted ? "SENT" : "FAILED", providerId: recipient?.providerMessageId,
      providerPayload: receipt.raw as never, updatedAt: new Date(),
    },
    create: {
      businessId: input.businessId, direction: "OUTBOUND", channel: input.simulator ? "SIMULATOR" : "SMS",
      status: accepted ? "SENT" : "FAILED", fromAddress: input.from, toAddress: input.to, body: input.body,
      providerId: recipient?.providerMessageId, fingerprint: input.fingerprint, providerPayload: receipt.raw as never,
    },
  });
  return { accepted, providerMessageId: recipient?.providerMessageId };
}

function savedStaffReply(payload: unknown): { body: string; commandAccepted: boolean } | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const value = (payload as Record<string, unknown>)._forgeStaffReply;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = (value as Record<string, unknown>).body;
  const commandAccepted = (value as Record<string, unknown>).commandAccepted;
  return typeof body === "string" && typeof commandAccepted === "boolean" ? { body, commandAccepted } : null;
}

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
      : new AfricasTalkingSmsAdapter({ username: process.env.AFRICASTALKING_USERNAME!, apiKey: process.env.AFRICASTALKING_API_KEY!, senderId: process.env.AFRICASTALKING_SENDER_ID });
    const inbound = adapter.receive(payload);
    const business = await db.business.findFirst({ where: { inboundNumber: inbound.to } });
    if (!business) throw new ApiError(404, "No business is configured for this inbound number");
    const fingerprint = smsPayloadFingerprint(inbound);
    const existing = await db.externalMessage.findUnique({ where: { businessId_fingerprint: { businessId: business.id, fingerprint } } });
    if (existing) {
      const savedReply = savedStaffReply(existing.providerPayload);
      if (!savedReply) return NextResponse.json({ accepted: true, duplicate: true });
      const replyFingerprint = `staff-reply:${existing.id}`;
      const delivered = await db.externalMessage.findUnique({ where: { businessId_fingerprint: { businessId: business.id, fingerprint: replyFingerprint } } });
      if (delivered?.status === "SENT") return NextResponse.json({ accepted: true, duplicate: true, replySent: true });
      const reply = await sendReply({ businessId: business.id, from: existing.toAddress, to: existing.fromAddress, body: savedReply.body, fingerprint: replyFingerprint, simulator });
      return NextResponse.json({ accepted: true, duplicate: true, commandAccepted: savedReply.commandAccepted, replySent: reply.accepted });
    }
    const message = await db.externalMessage.create({ data: {
      businessId: business.id, direction: "INBOUND", channel: simulator ? "SIMULATOR" : "SMS", status: "RECEIVED",
      fromAddress: inbound.from, toAddress: inbound.to, body: inbound.text, providerId: inbound.providerMessageId,
      fingerprint, providerPayload: payload as never, createdAt: inbound.receivedAt
    } });
    const [supplier, membership] = await Promise.all([
      db.supplier.findFirst({ where: { businessId: business.id, phone: inbound.from } }),
      db.businessMembership.findFirst({ where: { businessId: business.id, user: { phone: inbound.from } }, include: { user: true } }),
    ]);
    if (!supplier && !membership) throw new ApiError(422, "Sender is not registered as a supplier or factory user");
    if (membership) {
      let body: string;
      let commandAccepted = true;
      try {
        body = await handleStaffSms(db, {
          businessId: business.id, userId: membership.userId, role: membership.role,
          messageId: message.id, text: inbound.text,
        });
      } catch (error) {
        commandAccepted = false;
        body = `Unable to complete that command: ${error instanceof Error ? error.message : "unknown error"}. Text HELP for available commands.`;
      }
      await db.externalMessage.update({
        where: { id: message.id },
        data: { providerPayload: { ...(payload as Record<string, string>), _forgeStaffReply: { body, commandAccepted } } },
      });
      const reply = await sendReply({ businessId: business.id, from: inbound.to, to: inbound.from, body, fingerprint: `staff-reply:${message.id}`, simulator });
      return NextResponse.json({ accepted: true, commandAccepted, replySent: reply.accepted });
    }
    if (!supplier) throw new ApiError(422, "Sender is not a configured supplier");
    const rfqs = await db.rfq.findMany({ where: {
      businessId: business.id, status: { in: ["SENT", "QUOTING"] },
      recipients: { some: { supplierId: supplier.id } }
    }, include: { material: true } });
    if (rfqs.length !== 1) throw new ApiError(409, "Supplier response cannot be matched to one open RFQ");
    const rfq = rfqs[0];
    const extracted = await new SupplierQuoteExtractor().extract({
      message: inbound.text, requestedQuantity: Number(rfq.quantity), defaultCurrency: business.currency,
      businessTimeZone: business.timezone, referenceAt: inbound.receivedAt
    });
    if (extracted.missingFields.length || extracted.confidence < 0.7 || !extracted.unitPrice || !extracted.currency || !extracted.quantityAvailable || !extracted.deliveryDate) {
      const body = `Thanks. Please clarify: ${extracted.missingFields.join(", ") || "unit price, quantity and delivery date"}.`;
      await sendReply({ businessId: business.id, from: inbound.to, to: supplier.phone, body, fingerprint: `clarify:${message.id}`, simulator });
      return NextResponse.json({ accepted: true, clarificationRequired: true, missingFields: extracted.missingFields });
    }
    const quote = await recordSupplierResponse(db, {
      businessId: business.id, rfqId: rfq.id, supplierId: supplier.id, unitPrice: extracted.unitPrice,
      currency: extracted.currency, quantityAvailable: extracted.quantityAvailable,
      deliveryAt: new Date(`${extracted.deliveryDate}T12:00:00.000Z`), rawMessageId: message.id
    });
    if (rfq.objectiveId) await enqueueObjective(rfq.objectiveId);
    return NextResponse.json({ accepted: true, quoteId: quote.id, extractionSource: extracted.source });
  } catch (error) { return apiError(error); }
}
