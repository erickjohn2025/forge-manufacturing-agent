import type { PrismaClient, Role } from "@prisma/client";
import { enqueueObjective } from "./queue";
import { interpretObjective } from "./objective-interpreter";
import {
  allocateFinishedGoods,
  allocateProductionMaterials,
  createProductionJob,
  decideApproval,
  markOrdersReady,
  planObjective,
  recordGoodsReceipt,
  recordProductionCompletion,
  resetHeroScenario,
  verifyObjectiveCompletion,
} from "@/domain";
import { dateAtLocalEndOfDay } from "@/lib/dates";
import { logInfo } from "@/lib/logger";

export type StaffSmsCommand =
  | { kind: "APPROVE"; reference?: string }
  | { kind: "REJECT"; reference?: string }
  | { kind: "RECEIVE"; reference?: string }
  | { kind: "COMPLETE_PRODUCTION"; reference?: string; actualQuantity?: number }
  | { kind: "STATUS" }
  | { kind: "HELP" }
  | { kind: "RESET_HERO" }
  | { kind: "OBJECTIVE"; text: string };

const normalizedReference = (value?: string) => value?.trim().toUpperCase();
const numberFrom = (value?: string) => value ? Number(value.replaceAll(",", "")) : undefined;

export function parseStaffSms(text: string): StaffSmsCommand {
  const value = text.trim().replace(/\s+/g, " ");
  if (/^(help|commands|menu)$/i.test(value)) return { kind: "HELP" };
  if (/^(status|update|progress|what(?:'s| is) happening)\??$/i.test(value)) return { kind: "STATUS" };
  if (/^(reset hero|start over)[.!]?$/i.test(value)) return { kind: "RESET_HERO" };

  const approval = value.match(/^(approve|approved|yes[,]? approve)(?:\s+(?:purchase|approval|po)?\s*([a-z0-9-]+))?[.!]?$/i);
  if (approval) return { kind: "APPROVE", reference: normalizedReference(approval[2]) };
  const rejection = value.match(/^(reject|rejected|decline)(?:\s+(?:purchase|approval|po)?\s*([a-z0-9-]+))?[.!]?$/i);
  if (rejection) return { kind: "REJECT", reference: normalizedReference(rejection[2]) };

  const receipt = value.match(/^(?:receive|received|goods received|delivery received)(?:\s+(?:po\s*)?([a-z]+-?\d+))?[.!]?$/i);
  if (receipt) return { kind: "RECEIVE", reference: normalizedReference(receipt[1]) };

  const jobFirst = value.match(/(?:job\s+)?(pj-?\d+).*?(?:finished|complete|completed|produced)(?:\D+([\d,]+))?/i);
  const quantityFirst = value.match(/(?:finished|complete|completed|produced)\D+([\d,]+).*?(?:job\s+)?(pj-?\d+)/i);
  if (jobFirst) return { kind: "COMPLETE_PRODUCTION", reference: normalizedReference(jobFirst[1]), actualQuantity: numberFrom(jobFirst[2]) };
  if (quantityFirst) return { kind: "COMPLETE_PRODUCTION", reference: normalizedReference(quantityFirst[2]), actualQuantity: numberFrom(quantityFirst[1]) };
  if (/^(?:production|job)\s+(?:finished|complete|completed)(?:\D+([\d,]+))?[.!]?$/i.test(value)) {
    const quantity = value.match(/([\d,]+)/)?.[1];
    return { kind: "COMPLETE_PRODUCTION", actualQuantity: numberFrom(quantity) };
  }
  return { kind: "OBJECTIVE", text: value };
}

type StaffContext = {
  businessId: string;
  userId: string;
  role: Role;
  messageId: string;
  text: string;
};

function requireRole(role: Role, allowed: Role[]) {
  if (!allowed.includes(role)) throw new Error("Your SMS role is not authorised for that action");
}

async function singlePendingApproval(db: PrismaClient, input: StaffContext, reference?: string) {
  const approvals = await db.approvalRequest.findMany({
    where: {
      businessId: input.businessId,
      status: "PENDING",
      ...(reference ? { OR: [{ id: reference }, { quote: { rfq: { code: reference } } }] } : {}),
    },
    include: { quote: { include: { supplier: true, rfq: true } } },
    orderBy: { createdAt: "desc" },
    take: 2,
  });
  if (approvals.length === 0) throw new Error(reference ? `No pending approval matches ${reference}` : "There is no pending purchase approval");
  if (approvals.length > 1) throw new Error("More than one approval is pending; reply APPROVE followed by the RFQ code");
  return approvals[0];
}

async function receivePurchaseOrder(db: PrismaClient, input: StaffContext, reference?: string) {
  const orders = await db.purchaseOrder.findMany({
    where: { businessId: input.businessId, status: { in: ["ISSUED", "PARTIALLY_RECEIVED"] }, ...(reference ? { code: reference } : {}) },
    include: { objective: true }, orderBy: { expectedAt: "asc" }, take: 2,
  });
  if (orders.length === 0) throw new Error(reference ? `No open purchase order matches ${reference}` : "There is no purchase order waiting to be received");
  if (orders.length > 1) throw new Error("More than one purchase order is open; reply RECEIVED followed by the PO code");
  const po = orders[0];
  const dueOrders = process.env.DEMO_MODE === "true"
    ? await db.purchaseOrder.findMany({
        where: { businessId: input.businessId, status: { in: ["ISSUED", "PARTIALLY_RECEIVED"] }, expectedAt: { lte: po.expectedAt } },
        include: { objective: true }, orderBy: { expectedAt: "asc" },
      })
    : [po];
  for (const dueOrder of dueOrders) {
    await recordGoodsReceipt(db, { businessId: input.businessId, purchaseOrderId: dueOrder.id, receivedAt: po.expectedAt, idempotencyKey: `sms:${input.messageId}:receipt:${dueOrder.id}` });
  }
  const objective = po.objective ?? await db.objective.findFirst({
    where: { businessId: input.businessId, state: "IN_PROGRESS", purchaseOrders: { some: {} } },
    orderBy: { createdAt: "desc" },
  });
  if (!objective) return `${dueOrders.map((item) => item.code).join(" and ")} received. Available material inventory has been updated.`;
  const plan = await planObjective(db, { businessId: input.businessId, dueAt: objective.targetDueAt ?? new Date() });
  const jobs = [];
  const materialBlocks: string[] = [];
  for (const item of plan.data?.production.filter((product) => product.productionRequired > 0) ?? []) {
    const job = await createProductionJob(db, {
      businessId: input.businessId, objectiveId: objective.id, productId: item.productId,
      quantity: item.productionRequired, scheduledAt: new Date((objective.targetDueAt ?? new Date()).getTime() - 2 * 86_400_000),
      idempotencyKey: `${objective.id}:job:${item.productId}`,
    });
    const allocation = await allocateProductionMaterials(db, { businessId: input.businessId, jobId: job.id, idempotencyKey: `${job.id}:allocate` });
    if (!allocation.success) {
      materialBlocks.push(allocation.blockingReasons[0]?.message ?? "Materials are not ready");
    } else {
      jobs.push(job);
    }
  }
  await db.objectiveStep.updateMany({
    where: { objectiveId: objective.id, domain: "MAKE" },
    data: { status: "ACTIVE", detail: jobs.length ? `${jobs.length} production job(s) ready` : "Waiting for remaining material receipts" },
  });
  await db.agentActionEvent.upsert({
    where: { businessId_idempotencyKey: { businessId: input.businessId, idempotencyKey: `sms:${input.messageId}:receipt-event` } }, update: {},
    create: { businessId: input.businessId, objectiveId: objective.id, domain: "MAKE", status: "COMPLETED", title: `${dueOrders.map((item) => item.code).join(" and ")} received by SMS`, detail: "All scheduled incoming inventory due by this date moved to available inventory", toolName: "record_goods_receipt", idempotencyKey: `sms:${input.messageId}:receipt-event` },
  });
  const receiptCodes = dueOrders.map((item) => item.code).join(" and ");
  if (!jobs.length) return `${receiptCodes} received. Production is waiting for remaining materials: ${materialBlocks.join("; ")}.`;
  return `${receiptCodes} received. ${jobs.map((job) => `${job.code} is ready for ${Number(job.plannedQuantity).toLocaleString()} units`).join("; ")}.`;
}

async function completeProduction(db: PrismaClient, input: StaffContext, reference?: string, actualQuantity?: number) {
  const jobs = await db.productionJob.findMany({
    where: { businessId: input.businessId, status: { in: ["READY", "IN_PROGRESS"] }, ...(reference ? { code: reference } : {}) },
    include: { objective: true }, orderBy: { createdAt: "desc" }, take: 2,
  });
  if (jobs.length === 0) throw new Error(reference ? `No ready production job matches ${reference}` : "There is no production job ready for completion");
  if (jobs.length > 1) throw new Error("More than one production job is active; include the PJ code");
  const job = jobs[0];
  if (!job.objectiveId || !job.objective) throw new Error("That production job is not linked to an objective");
  const output = actualQuantity ?? Number(job.plannedQuantity);
  await recordProductionCompletion(db, { businessId: input.businessId, jobId: job.id, actualQuantity: output, idempotencyKey: `sms:${input.messageId}:production` });
  await db.agentActionEvent.upsert({
    where: { businessId_idempotencyKey: { businessId: input.businessId, idempotencyKey: `sms:${input.messageId}:production-event` } }, update: {},
    create: { businessId: input.businessId, objectiveId: job.objectiveId, domain: "MAKE", status: "COMPLETED", title: `${job.code} completed by SMS`, detail: `${output.toLocaleString()} finished units added`, toolName: "record_production_completion", idempotencyKey: `sms:${input.messageId}:production-event` },
  });
  const unfinished = await db.productionJob.count({ where: { objectiveId: job.objectiveId, businessId: input.businessId, status: { not: "COMPLETE" } } });
  if (unfinished) return `${job.code} completed with ${output.toLocaleString()} units. Waiting for ${unfinished} other production job(s).`;
  const plan = await planObjective(db, { businessId: input.businessId, dueAt: job.objective.targetDueAt ?? new Date() });
  const orderIds = plan.data?.orderIds ?? [];
  const allocation = await allocateFinishedGoods(db, { businessId: input.businessId, orderIds, idempotencyKey: `${job.objectiveId}:finished-goods` });
  if (!allocation.success) throw new Error(allocation.blockingReasons[0]?.message ?? "Finished goods cannot be allocated");
  await markOrdersReady(db, input.businessId, orderIds);
  await db.objectiveStep.updateMany({ where: { objectiveId: job.objectiveId, domain: "MAKE" }, data: { status: "COMPLETED", detail: "Production completed and inventory updated" } });
  await db.objectiveStep.updateMany({ where: { objectiveId: job.objectiveId, domain: "DELIVER" }, data: { status: "COMPLETED", detail: `${orderIds.length} orders ready for dispatch` } });
  await verifyObjectiveCompletion(db, { businessId: input.businessId, objectiveId: job.objectiveId, orderIds, idempotencyKey: `${job.objectiveId}:complete` });
  return `${job.code} completed with ${output.toLocaleString()} units. Objective complete: ${orderIds.length} orders are ready for dispatch.`;
}

export async function handleStaffSms(
  db: PrismaClient,
  input: StaffContext,
  enqueue: (objectiveId: string) => Promise<unknown> = enqueueObjective,
): Promise<string> {
  const command = parseStaffSms(input.text);
  logInfo("sms.staff.command", { businessId: input.businessId, userId: input.userId, messageId: input.messageId, role: input.role, commandKind: command.kind, reference: "reference" in command ? command.reference : undefined });
  if (command.kind === "HELP") return "Commands: send an objective; STATUS; APPROVE [RFQ code]; REJECT [RFQ code]; RECEIVED [PO code]; JOB [PJ code] FINISHED, PRODUCED [quantity]. In demo mode, an ADMIN can send RESET HERO.";
  if (command.kind === "RESET_HERO") {
    requireRole(input.role, ["ADMIN"]);
    if (process.env.DEMO_MODE !== "true") throw new Error("Hero reset is available only in demo mode");
    const baseline = await resetHeroScenario(db, input.businessId, { preserveMessageId: input.messageId });
    logInfo("demo.reset_by_sms", { businessId: input.businessId, userId: input.userId, messageId: input.messageId, ...baseline });
    return "Hero scenario reset: 3 Friday orders, 5,000 units demand, 1,000 finished units, and a 1,400 packaging shortage. Send the objective again to begin.";
  }
  if (command.kind === "STATUS") {
    const objective = await db.objective.findFirst({ where: { businessId: input.businessId, state: { notIn: ["COMPLETE", "FAILED"] } }, include: { events: { orderBy: { occurredAt: "desc" }, take: 1 } }, orderBy: { createdAt: "desc" } });
    return objective ? `Objective ${objective.state.replaceAll("_", " ")}: ${objective.events[0]?.title ?? objective.text}` : "No active manufacturing objective.";
  }
  if (command.kind === "APPROVE" || command.kind === "REJECT") {
    requireRole(input.role, ["ADMIN", "APPROVER"]);
    const approval = await singlePendingApproval(db, input, command.reference);
    const decision = command.kind === "APPROVE" ? "APPROVED" : "REJECTED";
    await decideApproval(db, { businessId: input.businessId, approvalId: approval.id, userId: input.userId, decision });
    if (approval.objectiveId) await enqueue(approval.objectiveId);
    return `${approval.quote.rfq.code} purchase ${decision.toLowerCase()}: ${approval.quote.supplier.name}, ${approval.currency} ${Number(approval.total).toLocaleString()}.`;
  }
  if (command.kind === "RECEIVE") {
    requireRole(input.role, ["ADMIN", "OPERATOR"]);
    return receivePurchaseOrder(db, input, command.reference);
  }
  if (command.kind === "COMPLETE_PRODUCTION") {
    requireRole(input.role, ["ADMIN", "OPERATOR"]);
    return completeProduction(db, input, command.reference, command.actualQuantity);
  }
  requireRole(input.role, ["ADMIN", "OPERATOR"]);
  if (command.text.length < 10) throw new Error("Please send a manufacturing objective or HELP for available commands");
  const interpreted = await interpretObjective(command.text);
  const business = await db.business.findUniqueOrThrow({ where: { id: input.businessId }, select: { timezone: true } });
  const objective = await db.objective.create({ data: {
    businessId: input.businessId, text: command.text, idempotencyKey: `sms:${input.messageId}`,
    targetDueAt: dateAtLocalEndOfDay(interpreted.dueDate, business.timezone), state: "PLANNING",
    steps: { create: [
      { domain: "PLAN", title: "Determine production readiness", sequence: 1, status: "ACTIVE" },
      { domain: "SOURCE", title: "Secure material shortages", sequence: 2 },
      { domain: "MAKE", title: "Coordinate production", sequence: 3 },
      { domain: "DELIVER", title: "Prepare orders for dispatch", sequence: 4 },
    ] },
  } });
  logInfo("objective.created_from_sms", {
    businessId: input.businessId,
    objectiveId: objective.id,
    messageId: input.messageId,
    targetDueAt: objective.targetDueAt?.toISOString(),
    interpretationSource: interpreted.source,
    confidence: interpreted.confidence,
  });
  await enqueue(objective.id);
  return `Objective accepted: ${command.text} I will coordinate PLAN, SOURCE, MAKE and DELIVER. Text STATUS anytime.`;
}
