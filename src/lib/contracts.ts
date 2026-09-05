export const OBJECTIVE_STATES = [
  "PLANNING", "IN_PROGRESS", "WAITING_EXTERNAL", "WAITING_APPROVAL",
  "BLOCKED", "COMPLETE", "FAILED"
] as const;
export type ObjectiveState = (typeof OBJECTIVE_STATES)[number];

export type ObjectiveDomain = "PLAN" | "SOURCE" | "MAKE" | "DELIVER";
export type TimelineStatus = "PENDING" | "ACTIVE" | "WAITING" | "COMPLETED" | "FAILED";

export type BlockingReason = { code: string; message: string };

export type ToolResult<T> = {
  success: boolean;
  data?: T;
  observations: string[];
  blockingReasons: BlockingReason[];
  eventsCreated: string[];
  nextObjectiveState?: ObjectiveState;
};

export type ObjectiveEvent = {
  id: string;
  domain: ObjectiveDomain;
  status: TimelineStatus;
  title: string;
  detail?: string;
  occurredAt: string;
  toolName?: string;
  payload?: unknown;
};

export function serializeObjectiveEvent(event: {
  id: string; domain: ObjectiveDomain; status: TimelineStatus; title: string;
  detail?: string | null; toolName?: string | null; payload?: unknown; occurredAt: Date | string;
}): ObjectiveEvent {
  return {
    id: event.id, domain: event.domain, status: event.status, title: event.title,
    detail: event.detail ?? undefined,
    occurredAt: typeof event.occurredAt === "string" ? event.occurredAt : event.occurredAt.toISOString(),
    toolName: event.toolName ?? undefined,
    payload: event.payload ?? undefined,
  };
}
