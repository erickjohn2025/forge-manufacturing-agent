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
};
