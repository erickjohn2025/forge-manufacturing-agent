import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ApiError, apiError } from "@/lib/http";
import { requireTenant } from "@/lib/tenant";
import { isDemoMode } from "@/lib/env";
import { SupplierQuoteExtractor } from "@/agent/quote-extractor";
import { recordSupplierResponse } from "@/domain";
import { smsPayloadFingerprint } from "@/communications/normalization";
import { enqueueObjective } from "@/agent/queue";

export async function POST(_: Request, { params }: { params: Promise<{ objectiveId: string }> }) {
  try {
    if (!isDemoMode) throw new ApiError(404, "Demo controls are disabled");
    const { businessId } = await requireTenant(["ADMIN", "OPERATOR"]);
    const { objectiveId } = await params;
    const rfq = await db.rfq.findFirst({
      where: { objectiveId, businessId, status: { in: ["SENT", "QUOTING"] } },
      include: { recipients: { include: { supplier: true } }, business: true }
    });
    if (!rfq) throw new ApiError(404, "Open RFQ not found");
    const messages = ["575 each. Can deliver Monday morning.", "I can do 540 each but Thursday."];
    const quoteIds: string[] = [];
    for (let index = 0; index < rfq.recipients.length; index++) {
      const recipient = rfq.recipients[index];
      const text = messages[index] ?? `600 each. Can deliver Monday.`;
      const providerMessageId = `sim-reply:${rfq.id}:${recipient.supplierId}`;
      const fingerprint = smsPayloadFingerprint({ provider: "simulator", providerMessageId, from: recipient.supplier.phone, to: rfq.business.inboundNumber ?? "+255700000000", text });
      const stored = await db.externalMessage.upsert({ where: { businessId_fingerprint: { businessId, fingerprint } }, update: {}, create: {
        businessId, direction: "INBOUND", channel: "SIMULATOR", status: "RECEIVED", fromAddress: recipient.supplier.phone,
        toAddress: rfq.business.inboundNumber ?? "+255700000000", body: text, providerId: providerMessageId, fingerprint
      } });
      const extracted = await new SupplierQuoteExtractor({ apiKey: undefined, client: undefined }).extract({
        message: text, requestedQuantity: Number(rfq.quantity), defaultCurrency: rfq.business.currency,
        businessTimeZone: rfq.business.timezone, referenceAt: new Date()
      });
      if (!extracted.unitPrice || !extracted.currency || !extracted.quantityAvailable || !extracted.deliveryDate) {
        throw new ApiError(422, `Could not parse simulated response from ${recipient.supplier.name}`);
      }
      const quote = await recordSupplierResponse(db, { businessId, rfqId: rfq.id, supplierId: recipient.supplierId,
        unitPrice: extracted.unitPrice, currency: extracted.currency, quantityAvailable: extracted.quantityAvailable,
        deliveryAt: new Date(`${extracted.deliveryDate}T12:00:00.000Z`), rawMessageId: stored.id });
      quoteIds.push(quote.id);
    }
    await enqueueObjective(objectiveId);
    return NextResponse.json({ quoteIds });
  } catch (error) { return apiError(error); }
}
