import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiError } from "@/lib/http";
import { requireTenant } from "@/lib/tenant";
import { counterpartOf, maskPhone } from "@/lib/phones";

const querySchema = z.object({
  cursor: z.string().min(1).optional(),
  take: z.coerce.number().int().min(1).max(100).default(40),
  direction: z.enum(["INBOUND", "OUTBOUND"]).optional(),
  counterpart: z.string().min(3).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const { businessId } = await requireTenant();
    const query = querySchema.parse({
      cursor: request.nextUrl.searchParams.get("cursor") ?? undefined,
      take: request.nextUrl.searchParams.get("take") ?? undefined,
      direction: request.nextUrl.searchParams.get("direction") ?? undefined,
      counterpart: request.nextUrl.searchParams.get("counterpart") ?? undefined,
    });
    const cursorRow = query.cursor
      ? await db.externalMessage.findFirst({ where: { id: query.cursor, businessId }, select: { createdAt: true } })
      : null;
    const messages = await db.externalMessage.findMany({
      where: {
        businessId,
        ...(query.direction ? { direction: query.direction } : {}),
        ...(query.counterpart ? { OR: [{ fromAddress: query.counterpart }, { toAddress: query.counterpart }] } : {}),
        ...(cursorRow ? { createdAt: { lt: cursorRow.createdAt } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: query.take + 1,
      select: {
        id: true, direction: true, channel: true, status: true,
        fromAddress: true, toAddress: true, body: true, createdAt: true,
      },
    });
    const hasMore = messages.length > query.take;
    const page = hasMore ? messages.slice(0, query.take) : messages;
    return NextResponse.json({
      items: page.map((message) => ({
        id: message.id, direction: message.direction, channel: message.channel, status: message.status,
        fromAddress: maskPhone(message.fromAddress), toAddress: maskPhone(message.toAddress),
        counterpart: maskPhone(counterpartOf(message.direction, message.fromAddress, message.toAddress)),
        body: message.body, createdAt: message.createdAt.toISOString(),
      })),
      nextCursor: hasMore ? page[page.length - 1]?.id : undefined,
    });
  } catch (error) { return apiError(error); }
}
