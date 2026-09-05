import type { ObjectiveEvent, ObjectiveState } from "./contracts";

export type ApprovalView = {
  id: string; supplierName: string; quantity: number; unitPrice: number; total: number;
  currency: string; deliveryDate: string; reason: string; status: string;
  materialName?: string; objectiveId?: string; objectiveText?: string;
};

export type FloorOrderView = {
  id: string; code: string; customer: string; dueAt: string; status: string;
  lineCount: number; ordered: number; allocated: number;
};

export type FloorStockView = {
  id: string; kind: "PRODUCT" | "MATERIAL"; sku: string; name: string; unit: string;
  onHand: number; reserved: number; available: number; safetyStock: number; shortage: boolean;
};

export type FloorEventView = {
  id: string; domain: string; status: string; title: string; detail?: string; toolName?: string; occurredAt: string;
};

export type FloorView = {
  orders: FloorOrderView[];
  stock: FloorStockView[];
  counts: { ordersDue: number; shortages: number; pendingApprovals: number; openRfqs: number; purchaseOrdersInFlight: number; activeJobs: number };
  events: FloorEventView[];
};

export type QuoteView = {
  id: string; supplierName: string; unitPrice: number; currency: string; deliveryDate: string;
  eligible: boolean; reason?: string;
};

export type ObjectiveView = {
  id: string;
  text: string;
  status: ObjectiveState;
  createdAt: string;
  events: ObjectiveEvent[];
  approval?: ApprovalView;
  quotes: QuoteView[];
  purchaseOrderId?: string;
  purchaseOrderCode?: string;
  productionJobId?: string;
  productionJobCode?: string;
  summary?: Record<string, string | number>;
};

export async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error?.message || payload.error || payload.message || `Request failed (${response.status})`);
  return (payload.data ?? payload) as T;
}

const asNumber = (value: unknown) => Number(value ?? 0);
const text = (value: unknown, fallback = "") => typeof value === "string" ? value : fallback;

export function normalizeObjective(input: unknown): ObjectiveView {
  const root = (input && typeof input === "object" ? input : {}) as Record<string, any>;
  const raw = root.objective && typeof root.objective === "object" ? { ...root, ...root.objective } : root;
  const approvals = raw.approvals ?? raw.approvalRequests ?? [];
  const approvalRaw = (raw.approval ?? raw.approvalRequest ?? approvals.find?.((item: any) => item.status === "PENDING") ?? approvals[0]) as Record<string, any> | undefined;
  const quotes = Array.isArray(raw.quotes)
    ? raw.quotes
    : Array.isArray(raw.supplierQuotes)
      ? raw.supplierQuotes
      : Array.isArray(raw.rfqs)
        ? raw.rfqs.flatMap((rfq: any) => Array.isArray(rfq.quotes) ? rfq.quotes : [])
        : [];
  const po = raw.purchaseOrder ?? raw.purchaseOrders?.[0];
  const job = raw.productionJob ?? raw.productionJobs?.[0];
  const actionEvents = Array.isArray(raw.events) ? raw.events : Array.isArray(raw.actionEvents) ? raw.actionEvents : [];
  const stepEvents = Array.isArray(raw.steps)
    ? raw.steps.filter((step: any) => !actionEvents.some((event: any) => event.domain === step.domain)).map((step: any) => ({
        id: `step-${step.id}`, domain: step.domain, status: step.status, title: step.title,
        detail: step.detail, occurredAt: step.updatedAt ?? step.createdAt ?? raw.createdAt,
      }))
    : [];
  return {
    id: text(raw.id),
    text: text(raw.text ?? raw.prompt ?? raw.description ?? raw.objectiveText, "Manufacturing objective"),
    status: (raw.state ?? raw.status ?? "PLANNING") as ObjectiveState,
    createdAt: text(raw.createdAt, new Date().toISOString()),
    events: [...actionEvents, ...stepEvents],
    quotes: quotes.map((quote: any) => ({
      id: text(quote.id), supplierName: text(quote.supplierName ?? quote.supplier?.name, "Supplier"),
      unitPrice: asNumber(quote.unitPrice), currency: text(quote.currency, "TZS"),
      deliveryDate: text(quote.deliveryAt ?? quote.deliveryDate), eligible: quote.eligible ?? quote.status !== "REJECTED",
      reason: text(quote.reason ?? quote.rejectionReason),
    })),
    approval: approvalRaw ? {
      id: text(approvalRaw.id), supplierName: text(approvalRaw.supplierName ?? approvalRaw.quote?.supplier?.name ?? approvalRaw.payload?.supplierName, "Supplier A"),
      quantity: asNumber(approvalRaw.quantity ?? approvalRaw.quote?.quantityAvailable ?? approvalRaw.payload?.quantity), unitPrice: asNumber(approvalRaw.unitPrice ?? approvalRaw.quote?.unitPrice ?? approvalRaw.payload?.unitPrice),
      total: asNumber(approvalRaw.total ?? approvalRaw.totalAmount ?? approvalRaw.payload?.total), currency: text(approvalRaw.currency ?? approvalRaw.payload?.currency, "TZS"),
      deliveryDate: text(approvalRaw.deliveryDate ?? approvalRaw.quote?.deliveryAt ?? approvalRaw.payload?.deliveryDate), reason: text(approvalRaw.reason, "Lowest-cost approved supplier capable of meeting the production deadline."),
      status: text(approvalRaw.status, "PENDING"),
    } : undefined,
    purchaseOrderId: text(po?.id || raw.purchaseOrderId) || undefined,
    purchaseOrderCode: text(po?.code || po?.displayCode || raw.purchaseOrderCode) || undefined,
    productionJobId: text(job?.id || raw.productionJobId) || undefined,
    productionJobCode: text(job?.code || job?.displayCode || raw.productionJobCode) || undefined,
    summary: raw.summary,
  };
}

export function formatMoney(value: number, currency = "TZS") {
  return `${currency} ${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value)}`;
}

export function friendlyState(state: string) {
  return state.toLowerCase().replaceAll("_", " ").replace(/^./, (char) => char.toUpperCase());
}
