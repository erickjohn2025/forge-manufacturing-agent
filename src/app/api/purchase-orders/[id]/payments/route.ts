import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, apiError } from "@/lib/http";
import { requireTenant } from "@/lib/tenant";
import { getPaymentProvider, normalizeTzPhone } from "@/payments/provider";
import { refreshPurchasePayment } from "@/payments/service";

const bodySchema = z.object({ phone: z.string().trim().max(30).optional() });

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { businessId } = await requireTenant();
    const { id } = await params;
    const payment = await db.purchasePayment.findFirst({
      where: { businessId, purchaseOrderId: id },
      orderBy: { createdAt: "desc" },
    });
    if (!payment) throw new ApiError(404, "No payment has been started for this purchase order");
    return NextResponse.json(await refreshPurchasePayment(db, { businessId, paymentId: payment.id }));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const tenant = await requireTenant(["ADMIN", "APPROVER"]);
    const { id } = await params;
    const input = bodySchema.parse(await request.json().catch(() => ({})));
    const [purchaseOrder, user] = await Promise.all([
      db.purchaseOrder.findFirst({
        where: { id, businessId: tenant.businessId, status: { not: "CANCELLED" } },
        include: { business: { select: { manufacturerPaymentPhone: true } }, payments: { orderBy: { createdAt: "desc" }, take: 1 } },
      }),
      db.user.findUniqueOrThrow({ where: { id: tenant.userId } }),
    ]);
    if (!purchaseOrder) throw new ApiError(404, "Purchase order not found");
    if (purchaseOrder.currency !== "TZS") throw new ApiError(422, "The mobile-money demo currently collects TZS purchase orders only");

    const existing = purchaseOrder.payments[0];
    if (existing?.status === "COMPLETED") return NextResponse.json(existing);
    if (existing?.status === "PENDING") {
      return NextResponse.json(await refreshPurchasePayment(db, { businessId: tenant.businessId, paymentId: existing.id }));
    }

    const payerPhone = normalizeTzPhone(input.phone || purchaseOrder.business.manufacturerPaymentPhone || "");
    if (!payerPhone) throw new ApiError(422, "Configure the manufacturer's Tanzanian mobile-money number before collecting payment");
    const amount = Number(purchaseOrder.total);
    if (!Number.isSafeInteger(amount) || amount <= 0) throw new ApiError(422, "The purchase-order total must be a positive whole TZS amount");

    const provider = getPaymentProvider();
    const paymentId = randomUUID();
    const payment = await db.purchasePayment.create({
      data: {
        id: paymentId,
        businessId: tenant.businessId,
        purchaseOrderId: purchaseOrder.id,
        initiatedById: user.id,
        provider: provider.name,
        amount: purchaseOrder.total,
        currency: purchaseOrder.currency,
        payerName: user.name,
        payerEmail: user.email,
        payerPhone,
        idempotencyKey: `purchase:${purchaseOrder.id}:${paymentId}`,
      },
    });
    const publicBase = (process.env.PUBLIC_WEBHOOK_BASE_URL || process.env.APP_URL || "").replace(/\/$/, "");
    const result = await provider.createCollection({
      orderId: payment.id,
      amountTzs: amount,
      payerName: payment.payerName,
      payerEmail: payment.payerEmail,
      payerPhone: payment.payerPhone,
      webhookUrl: publicBase && !/localhost|127\.0\.0\.1/.test(publicBase)
        ? `${publicBase}/api/webhooks/payments/zenopay`
        : undefined,
    });
    if (!result.ok) {
      const failed = await db.purchasePayment.update({ where: { id: payment.id }, data: { status: "FAILED", failureReason: result.message } });
      throw new ApiError(502, failed.failureReason || "Could not start payment");
    }
    await db.agentActionEvent.create({
      data: {
        businessId: tenant.businessId,
        objectiveId: purchaseOrder.objectiveId,
        domain: "SOURCE",
        status: "WAITING",
        title: `${purchaseOrder.code} payment requested`,
        detail: `${purchaseOrder.currency} ${amount.toLocaleString()} requested from the manufacturer via ${provider.name === "demo" ? "demo payment" : "mobile money"}`,
        toolName: "request_purchase_payment",
        payload: { paymentId: payment.id, provider: provider.name },
        idempotencyKey: `payment:${payment.id}:requested`,
      },
    });
    return NextResponse.json({ ...payment, message: result.message }, { status: 202 });
  } catch (error) {
    return apiError(error);
  }
}
