import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { getMessagingAdapter } from "@/communications/factory";
import { smsPayloadFingerprint } from "@/communications/normalization";
import {
  createPurchaseOrder, createRfq, evaluateSupplierQuotes, getApprovedSuppliers,
  planObjective, requestPurchaseApproval
} from "@/domain";

async function event(input: {
  businessId: string; objectiveId: string; domain: "PLAN" | "SOURCE" | "MAKE" | "DELIVER";
  status: "PENDING" | "ACTIVE" | "WAITING" | "COMPLETED" | "FAILED";
  title: string; detail?: string; toolName?: string; key: string; payload?: object;
}) {
  return db.agentActionEvent.upsert({
    where: { businessId_idempotencyKey: { businessId: input.businessId, idempotencyKey: input.key } },
    update: {},
    create: {
      businessId: input.businessId, objectiveId: input.objectiveId, domain: input.domain,
      status: input.status, title: input.title, detail: input.detail, toolName: input.toolName,
      idempotencyKey: input.key, payload: input.payload
    }
  });
}

async function persistOutbound(input: {
  businessId: string; from: string; to: string; body: string; providerId?: string; key: string; status: "SENT" | "FAILED";
}) {
  return db.externalMessage.upsert({
    where: { businessId_fingerprint: { businessId: input.businessId, fingerprint: input.key } },
    update: { providerId: input.providerId, status: input.status },
    create: {
      businessId: input.businessId, direction: "OUTBOUND",
      channel: process.env.SMS_PROVIDER === "africas-talking" ? "SMS" : "SIMULATOR",
      status: input.status, fromAddress: input.from, toAddress: input.to, body: input.body,
      providerId: input.providerId, fingerprint: input.key
    }
  });
}

function providerAccepted(recipient?: { providerMessageId?: string; status: string }) {
  return Boolean(recipient?.providerMessageId && recipient.providerMessageId !== "None" && /success|sent|queued/i.test(recipient.status));
}

async function sendApprovalNotice(input: {
  businessId: string; objectiveId: string; rfqCode: string; supplierName: string;
  quantity: number; currency: string; total: number; deliveryAt: Date;
}) {
  const recipients = await db.businessMembership.findMany({
    where: { businessId: input.businessId, role: { in: ["ADMIN", "APPROVER"] }, user: { phone: { not: null } } },
    include: { user: true },
  });
  for (const membership of recipients) {
    if (!membership.user.phone) continue;
    const key = `approval-notice:${input.objectiveId}:${input.rfqCode}:${membership.userId}`;
    const existing = await db.externalMessage.findUnique({ where: { businessId_fingerprint: { businessId: input.businessId, fingerprint: key } } });
    if (existing?.status === "SENT" || existing?.status === "DELIVERED") continue;
    const body = `Approval required for ${input.rfqCode}: ${input.supplierName}, ${input.quantity.toLocaleString()} units, ${input.currency} ${input.total.toLocaleString()}, delivery ${input.deliveryAt.toLocaleDateString("en-GB", { weekday: "long" })}. Reply APPROVE ${input.rfqCode} or REJECT ${input.rfqCode}.`;
    const receipt = await getMessagingAdapter().send({ businessId: input.businessId, to: [membership.user.phone], message: body, idempotencyKey: key });
    const provider = receipt.recipients[0];
    await persistOutbound({ businessId: input.businessId, from: process.env.AFRICASTALKING_SENDER_ID ?? "MANU", to: membership.user.phone, body, providerId: provider?.providerMessageId, key, status: providerAccepted(provider) ? "SENT" : "FAILED" });
  }
}

async function sendRfq(rfqId: string, businessId: string) {
  const rfq = await db.rfq.findFirstOrThrow({
    where: { id: rfqId, businessId },
    include: { material: true, recipients: { include: { supplier: true } }, business: true }
  });
  const adapter = getMessagingAdapter();
  for (const recipient of rfq.recipients) {
    if (recipient.sentAt) continue;
    const message = `${rfq.business.name} needs ${Number(rfq.quantity).toLocaleString()} ${rfq.material.name} by ${rfq.requiredAt.toLocaleDateString("en-GB", { weekday: "long", timeZone: rfq.business.timezone })}. Please send your unit price, available quantity and earliest delivery date.`;
    const key = `rfq:${rfq.id}:${recipient.supplierId}`;
    const receipt = await adapter.send({ businessId, to: [recipient.supplier.phone], message, idempotencyKey: key });
    const provider = receipt.recipients[0];
    const accepted = providerAccepted(provider);
    await persistOutbound({ businessId, from: process.env.AFRICASTALKING_SENDER_ID ?? "MANU", to: recipient.supplier.phone, body: message, providerId: provider?.providerMessageId, key, status: accepted ? "SENT" : "FAILED" });
    if (!accepted) throw new Error(`SMS provider rejected RFQ delivery to ${recipient.supplier.name}: ${provider?.status ?? "unknown status"}`);
    await db.rfqRecipient.update({ where: { id: recipient.id }, data: { sentAt: new Date(), providerId: provider?.providerMessageId } });
  }
  await db.rfq.update({ where: { id: rfq.id }, data: { status: "SENT" } });
}

async function sendPurchaseOrder(purchaseOrderId: string, businessId: string) {
  const po = await db.purchaseOrder.findFirstOrThrow({
    where: { id: purchaseOrderId, businessId },
    include: { supplier: true, lines: { include: { material: true } } }
  });
  const line = po.lines[0];
  const message = `${po.code} confirmed: ${Number(line.quantity).toLocaleString()} ${line.material.name} at ${po.currency} ${Number(line.unitPrice).toLocaleString()} each. Delivery ${po.expectedAt.toLocaleDateString("en-GB", { weekday: "long" })}.`;
  const key = `po:${po.id}:confirmation`;
  const receipt = await getMessagingAdapter().send({ businessId, to: [po.supplier.phone], message, idempotencyKey: key });
  const provider = receipt.recipients[0];
  const accepted = providerAccepted(provider);
  await persistOutbound({ businessId, from: process.env.AFRICASTALKING_SENDER_ID ?? "MANU", to: po.supplier.phone, body: message, providerId: provider?.providerMessageId, key, status: accepted ? "SENT" : "FAILED" });
  if (!accepted) throw new Error(`SMS provider rejected ${po.code} confirmation: ${provider?.status ?? "unknown status"}`);
}

export async function runObjectiveCycle(objectiveId: string) {
  const objective = await db.objective.findUniqueOrThrow({ where: { id: objectiveId }, include: { business: true } });
  const { businessId } = objective;
  if (["COMPLETE", "FAILED", "BLOCKED"].includes(objective.state)) return;

  if (objective.state === "PLANNING") {
    const plan = await planObjective(db, { businessId, dueAt: objective.targetDueAt ?? new Date() });
    if (!plan.data) throw new Error("Planning returned no data");
    await event({ businessId, objectiveId, domain: "PLAN", status: "COMPLETED", title: "Friday demand and production requirement calculated", detail: plan.observations.join(" · "), toolName: "plan_objective", key: `${objectiveId}:plan`, payload: plan.data });
    await db.objectiveStep.updateMany({ where: { objectiveId, domain: "PLAN" }, data: { status: "COMPLETED", detail: plan.observations.join(" · ") } });

    const shortages = plan.data.materials.filter((item) => item.netShortage > 0);
    if (shortages.length) {
      await db.objectiveStep.updateMany({ where: { objectiveId, domain: "SOURCE" }, data: { status: "ACTIVE" } });
      for (const shortage of shortages) {
        const suppliers = await getApprovedSuppliers(db, businessId, shortage.materialId);
        if (!suppliers.length) {
          await db.objective.update({ where: { id: objectiveId }, data: { state: "BLOCKED" } });
          await event({ businessId, objectiveId, domain: "SOURCE", status: "FAILED", title: `No approved suppliers for ${shortage.materialName}`, key: `${objectiveId}:no-supplier:${shortage.materialId}` });
          return;
        }
        const requiredAt = new Date((objective.targetDueAt ?? new Date()).getTime() - 3 * 86_400_000);
        const rfq = await createRfq(db, {
          businessId, objectiveId, materialId: shortage.materialId, quantity: shortage.netShortage,
          requiredAt, responseDueAt: new Date(Date.now() + 2 * 3_600_000), supplierIds: suppliers.map((s) => s.id),
          idempotencyKey: `${objectiveId}:rfq:${shortage.materialId}`
        });
        await sendRfq(rfq.id, businessId);
      }
      await db.objective.update({ where: { id: objectiveId }, data: { state: "WAITING_EXTERNAL" } });
      await event({ businessId, objectiveId, domain: "SOURCE", status: "WAITING", title: "Waiting for supplier quotations", detail: `${shortages.length} material shortage${shortages.length === 1 ? "" : "s"} require sourcing`, toolName: "send_rfq", key: `${objectiveId}:waiting-quotes` });
      return;
    }
    await db.objective.update({ where: { id: objectiveId }, data: { state: "IN_PROGRESS" } });
    return;
  }

  if (objective.state === "WAITING_EXTERNAL") {
    const rfqs = await db.rfq.findMany({ where: { objectiveId, businessId }, include: { recipients: true, quotes: true } });
    if (!rfqs.length || rfqs.some((rfq) => rfq.quotes.length < rfq.recipients.length)) return;
    for (const rfq of rfqs) {
      const evaluation = await evaluateSupplierQuotes(db, { businessId, rfqId: rfq.id });
      if (!evaluation.data?.selectedQuoteId) {
        await db.objective.update({ where: { id: objectiveId }, data: { state: "BLOCKED" } });
        return;
      }
      const quote = await db.supplierQuote.findUniqueOrThrow({ where: { id: evaluation.data.selectedQuoteId }, include: { supplier: true, rfq: true } });
      const total = Number(quote.unitPrice) * Number(quote.rfq.quantity);
      await event({ businessId, objectiveId, domain: "SOURCE", status: "COMPLETED", title: `${quote.supplier.name} selected`, detail: `${evaluation.data.rejected.length} quote(s) rejected by hard constraints · ${quote.currency} ${total.toLocaleString()}`, toolName: "evaluate_supplier_quotes", key: `${objectiveId}:evaluate:${rfq.id}`, payload: evaluation.data });
      if (total > Number(objective.business.autoPurchaseLimit)) {
        await requestPurchaseApproval(db, { businessId, objectiveId, quoteId: quote.id });
        await sendApprovalNotice({
          businessId, objectiveId, rfqCode: quote.rfq.code, supplierName: quote.supplier.name,
          quantity: Number(quote.rfq.quantity), currency: quote.currency, total, deliveryAt: quote.deliveryAt,
        });
      } else {
        const po = await createPurchaseOrder(db, { businessId, objectiveId, quoteId: quote.id, idempotencyKey: `${objectiveId}:po:${quote.id}` });
        await sendPurchaseOrder(po.id, businessId);
      }
    }
    const pending = await db.approvalRequest.count({ where: { objectiveId, businessId, status: "PENDING" } });
    await db.objective.update({ where: { id: objectiveId }, data: { state: pending ? "WAITING_APPROVAL" : "IN_PROGRESS" } });
    if (pending) await event({ businessId, objectiveId, domain: "SOURCE", status: "WAITING", title: "Purchase approval required", detail: "The selected purchase exceeds the autonomous purchasing limit", toolName: "request_approval", key: `${objectiveId}:waiting-approval` });
    return;
  }

  if (objective.state === "WAITING_APPROVAL") {
    const approvals = await db.approvalRequest.findMany({ where: { objectiveId, businessId }, include: { quote: true } });
    if (approvals.some((approval) => approval.status === "REJECTED" || approval.status === "STALE")) {
      await db.objective.update({ where: { id: objectiveId }, data: { state: "BLOCKED" } });
      return;
    }
    if (approvals.some((approval) => approval.status === "PENDING")) return;
    for (const approval of approvals) {
      const po = await createPurchaseOrder(db, { businessId, objectiveId, quoteId: approval.quoteId, idempotencyKey: `${objectiveId}:po:${approval.quoteId}` });
      await sendPurchaseOrder(po.id, businessId);
    }
    await db.objective.update({ where: { id: objectiveId }, data: { state: "IN_PROGRESS" } });
    await db.objectiveStep.updateMany({ where: { objectiveId, domain: "SOURCE" }, data: { status: "COMPLETED", detail: "Materials secured; awaiting receipt" } });
    await event({ businessId, objectiveId, domain: "SOURCE", status: "COMPLETED", title: "Purchase order issued", detail: "Incoming materials recorded without increasing available stock", toolName: "create_purchase_order", key: `${objectiveId}:po-issued:${randomUUID()}` });
  }
}

export const externalMessageFingerprint = smsPayloadFingerprint;
