import type { PaymentStatus, PrismaClient } from "@prisma/client";
import { getPaymentProvider } from "./provider";

export async function refreshPurchasePayment(db: PrismaClient, input: { businessId: string; paymentId: string }) {
  const payment = await db.purchasePayment.findFirstOrThrow({
    where: { id: input.paymentId, businessId: input.businessId },
    include: { purchaseOrder: true },
  });
  if (payment.status !== "PENDING") return payment;

  const remote = await getPaymentProvider().checkStatus(payment.id, payment.createdAt);
  if (remote.status !== "completed" && remote.status !== "failed") return payment;
  const status = remote.status.toUpperCase() as PaymentStatus;
  const updated = await db.purchasePayment.update({
    where: { id: payment.id },
    data: {
      status,
      providerReference: remote.reference,
      completedAt: status === "COMPLETED" ? new Date() : null,
    },
    include: { purchaseOrder: true },
  });
  await db.agentActionEvent.upsert({
    where: { businessId_idempotencyKey: { businessId: payment.businessId, idempotencyKey: `payment:${payment.id}:${status.toLowerCase()}` } },
    update: {},
    create: {
      businessId: payment.businessId,
      objectiveId: payment.purchaseOrder.objectiveId,
      domain: "SOURCE",
      status: status === "COMPLETED" ? "COMPLETED" : "FAILED",
      title: status === "COMPLETED" ? `${payment.purchaseOrder.code} funded` : `${payment.purchaseOrder.code} payment failed`,
      detail: status === "COMPLETED"
        ? `${payment.currency} ${Number(payment.amount).toLocaleString()} collected from the manufacturer`
        : "The manufacturer collection did not complete",
      toolName: "refresh_purchase_payment",
      payload: { paymentId: payment.id, provider: payment.provider },
      idempotencyKey: `payment:${payment.id}:${status.toLowerCase()}`,
    },
  });
  return updated;
}
