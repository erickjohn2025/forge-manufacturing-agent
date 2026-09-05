import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiError } from "@/lib/http";
import { refreshPurchasePayment } from "@/payments/service";

const webhookSchema = z.object({ order_id: z.string().min(1) }).passthrough();

export async function POST(request: Request) {
  try {
    const payload = webhookSchema.parse(await request.json());
    const payment = await db.purchasePayment.findUnique({ where: { id: payload.order_id } });
    if (!payment) return NextResponse.json({ accepted: true });
    // Never trust the callback's claimed status. Confirm it server-to-server with ZenoPay.
    const updated = await refreshPurchasePayment(db, { businessId: payment.businessId, paymentId: payment.id });
    return NextResponse.json({ accepted: true, status: updated.status });
  } catch (error) {
    return apiError(error);
  }
}
