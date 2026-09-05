import { db } from "@/lib/db";
import { serializeObjectiveEvent } from "@/lib/contracts";
import { ApiError, apiError } from "@/lib/http";
import { requireTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { businessId } = await requireTenant();
    const { id } = await params;
    const exists = await db.objective.findFirst({ where: { id, businessId }, select: { id: true } });
    if (!exists) throw new ApiError(404, "Objective not found");

    const encoder = new TextEncoder();
    let lastSeen = new Date(0);
    let closed = false;
    const stream = new ReadableStream({
      async start(controller) {
        const send = async () => {
          if (closed) return;
          const [objective, events] = await Promise.all([
            db.objective.findFirst({ where: { id, businessId }, select: { state: true, updatedAt: true } }),
            db.agentActionEvent.findMany({
              where: { objectiveId: id, businessId, occurredAt: { gt: lastSeen } },
              orderBy: { occurredAt: "asc" }
            })
          ]);
          for (const event of events) {
            lastSeen = event.occurredAt;
            controller.enqueue(encoder.encode(`event: objective-event\ndata: ${JSON.stringify(serializeObjectiveEvent(event))}\n\n`));
          }
          controller.enqueue(encoder.encode(`event: state\ndata: ${JSON.stringify(objective)}\n\n`));
        };
        await send();
        const timer = setInterval(() => void send().catch(() => { closed = true; clearInterval(timer); controller.close(); }), 1500);
        request.signal.addEventListener("abort", () => { closed = true; clearInterval(timer); try { controller.close(); } catch {} });
      },
      cancel() { closed = true; }
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive"
      }
    });
  } catch (error) { return apiError(error); }
}
