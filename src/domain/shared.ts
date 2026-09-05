import type { Prisma, PrismaClient } from "@prisma/client";
import type { ObjectiveDomain, TimelineStatus, ToolResult } from "@/lib/contracts";

export type DbClient = PrismaClient | Prisma.TransactionClient;

export const numberOf = (value: Prisma.Decimal | number | string | null | undefined): number =>
  value == null ? 0 : Number(value);

export const ok = <T>(data: T, observations: string[] = [], eventsCreated: string[] = []): ToolResult<T> => ({
  success: true,
  data,
  observations,
  blockingReasons: [],
  eventsCreated,
});

export const blocked = <T>(code: string, message: string, data?: T): ToolResult<T> => ({
  success: false,
  data,
  observations: [],
  blockingReasons: [{ code, message }],
  eventsCreated: [],
});

export async function recordEvent(
  tx: DbClient,
  input: {
    businessId: string;
    objectiveId?: string;
    domain: ObjectiveDomain;
    status: TimelineStatus;
    title: string;
    detail?: string;
    toolName?: string;
    payload?: Prisma.InputJsonValue;
    idempotencyKey: string;
  },
): Promise<string> {
  const event = await tx.agentActionEvent.upsert({
    where: { businessId_idempotencyKey: { businessId: input.businessId, idempotencyKey: input.idempotencyKey } },
    create: input,
    update: {},
    select: { id: true },
  });
  return event.id;
}

export async function nextBusinessCode(
  tx: DbClient,
  businessId: string,
  key: "RFQ" | "PO" | "PJ",
): Promise<string> {
  const starting = key === "RFQ" ? 104 : key === "PO" ? 204 : 301;
  await tx.businessSequence.upsert({
    where: { businessId_key: { businessId, key } },
    create: { businessId, key, nextValue: starting },
    update: {},
  });
  const sequence = await tx.businessSequence.update({
    where: { businessId_key: { businessId, key } },
    data: { nextValue: { increment: 1 } },
    select: { nextValue: true },
  });
  return `${key}-${sequence.nextValue - 1}`;
}

export async function assertTenantRecord(
  exists: boolean,
  entity: string,
): Promise<void> {
  if (!exists) throw new Error(`${entity} not found in this business`);
}
