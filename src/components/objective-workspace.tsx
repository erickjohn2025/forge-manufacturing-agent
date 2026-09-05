"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";

import type { ObjectiveDomain, ObjectiveEvent } from "@/lib/contracts";
import { apiFetch, formatMoney, friendlyState, normalizeObjective, type ObjectiveView } from "@/lib/ui-api";
import { AlertIcon, ArrowIcon, BoxIcon, CheckIcon, ClockIcon, MessageIcon, SparkIcon } from "./icons";

const domains: Array<{ id: ObjectiveDomain; label: string; caption: string }> = [
  { id: "PLAN", label: "Plan", caption: "Demand & readiness" }, { id: "SOURCE", label: "Source", caption: "Materials & suppliers" },
  { id: "MAKE", label: "Make", caption: "Production" }, { id: "DELIVER", label: "Deliver", caption: "Fulfilment" },
];

function eventIcon(status: ObjectiveEvent["status"]) {
  if (status === "COMPLETED") return <CheckIcon />;
  if (status === "FAILED") return <AlertIcon />;
  return <ClockIcon />;
}

function currentActivity(objective: ObjectiveView) {
  if (objective.status === "COMPLETE") return { title: "Outcome verified", detail: "Every target order is allocated and ready for dispatch.", tone: "complete" };
  if (objective.status === "BLOCKED" || objective.status === "FAILED") return { title: "Human attention required", detail: "The agent cannot continue until the blocking condition is resolved.", tone: "blocked" };
  if (objective.status === "WAITING_APPROVAL") return { title: "Waiting for purchase approval", detail: "An authorised approver must approve or reject the selected supplier quote.", tone: "waiting" };
  if (objective.status === "WAITING_EXTERNAL") return { title: "Waiting for supplier quotations", detail: `${objective.quotes.length} quotation${objective.quotes.length === 1 ? "" : "s"} received so far.`, tone: "waiting" };
  if (objective.productionJobId && objective.productionJobStatus !== "COMPLETE") return { title: `${objective.productionJobCode ?? "Production job"} is ready`, detail: `${objective.productionJobQuantity?.toLocaleString() ?? "Planned"} units are awaiting production completion.`, tone: "active" };
  if (objective.purchaseOrderId && objective.purchaseOrderStatus !== "RECEIVED") return { title: `${objective.purchaseOrderCode ?? "Purchase order"} issued — awaiting receipt`, detail: "Materials are incoming and have not been added to available inventory.", tone: "waiting" };
  return { title: "Agent is planning and coordinating", detail: "Operational tools are running against current manufacturing data.", tone: "active" };
}

export function ObjectiveWorkspace({ objectiveId }: { objectiveId: string }) {
  const [objective, setObjective] = useState<ObjectiveView | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [paymentPhone, setPaymentPhone] = useState("");
  const [pending, startTransition] = useTransition();
  const load = useCallback(async () => {
    try { setObjective(normalizeObjective(await apiFetch<unknown>(`/api/objectives/${objectiveId}`))); setError(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load this objective."); }
  }, [objectiveId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const stream = new EventSource(`/api/objectives/${objectiveId}/stream`);
    stream.onmessage = () => void load();
    stream.addEventListener("objective-event", () => void load());
    stream.addEventListener("state", () => void load());
    return () => stream.close();
  }, [objectiveId, load]);
  useEffect(() => {
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 3_000);
    return () => window.clearInterval(timer);
  }, [load]);
  useEffect(() => {
    if (objective?.payment?.status !== "PENDING" || !objective.purchaseOrderId) return;
    const timer = setInterval(() => {
      void apiFetch(`/api/purchase-orders/${objective.purchaseOrderId}/payments`).then(() => load()).catch(() => undefined);
    }, 3_000);
    return () => clearInterval(timer);
  }, [objective?.payment?.status, objective?.purchaseOrderId, load]);

  const eventsByDomain = useMemo(() => Object.fromEntries(domains.map(({ id }) => [id, objective?.events.filter((event) => event.domain === id) ?? []])) as Record<ObjectiveDomain, ObjectiveEvent[]>, [objective]);

  function action(url: string, body?: unknown, message?: string) {
    startTransition(async () => {
      try { setError(""); await apiFetch(url, { method: "POST", body: JSON.stringify(body ?? {}) }); setNotice(message ?? "Action completed."); await load(); }
      catch (cause) { setError(cause instanceof Error ? cause.message : "The action could not be completed."); }
    });
  }

  if (!objective && !error) return <div className="workspace-loading"><span/><span/><span/></div>;
  if (!objective) return <div className="page-error"><AlertIcon /><h2>Objective unavailable</h2><p>{error}</p><button onClick={() => load()}>Try again</button></div>;

  const completed = objective.status === "COMPLETE";
  const activity = currentActivity(objective);
  return <div className="objective-workspace">
    <div className="crumb"><Link href="/objectives">Objectives</Link><span>/</span><span>Objective {objective.id.slice(-6)}</span></div>
    <header className="objective-header">
      <div><span className={`state-badge ${objective.status.toLowerCase()}`}><i /> {friendlyState(objective.status)}</span><h1>{objective.text}</h1><p>Started {new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(objective.createdAt))}</p></div>
      <div className="agent-working"><span><SparkIcon /></span><p><strong>{completed ? "Outcome verified" : objective.status.startsWith("WAITING") ? "Agent is waiting" : "Agent is coordinating"}</strong><small>{completed ? "All conditions have been checked" : "Updates appear here in real time"}</small></p></div>
    </header>

    {error && <div className="banner error"><AlertIcon />{error}</div>}
    {notice && <div className="banner success"><CheckIcon />{notice}<button onClick={() => setNotice("")}>×</button></div>}

    <section className={`current-activity ${activity.tone}`}><span>{activity.tone === "complete" ? <CheckIcon /> : activity.tone === "blocked" ? <AlertIcon /> : <ClockIcon />}</span><div><small>RIGHT NOW</small><strong>{activity.title}</strong><p>{activity.detail}</p></div><i /></section>

    {completed && <section className="completion-hero"><span className="completion-check"><CheckIcon /></span><div><span>OBJECTIVE COMPLETE</span><h2>All Friday orders are ready for fulfilment.</h2><p>Your agent verified materials, production, and finished-goods allocation.</p></div></section>}

    <div className="domain-rail">{domains.map((domain, index) => {
      const domainEvents = eventsByDomain[domain.id];
      const step = objective.steps.find((item) => item.domain === domain.id);
      const hasFailure = step?.status === "FAILED" || domainEvents.some((event) => event.status === "FAILED");
      const isWaiting = step?.status === "WAITING" || (!step && domainEvents.some((event) => event.status === "WAITING"));
      const isDone = completed || step?.status === "COMPLETED";
      const isActive = step?.status === "ACTIVE" || isWaiting;
      return <div className={`domain-node ${isDone ? "done" : hasFailure ? "failed" : isActive ? "active" : ""}`} key={domain.id}>
        <span className="domain-index">{isDone ? <CheckIcon /> : String(index + 1).padStart(2, "0")}</span><p><strong>{domain.label}</strong><small>{domain.caption}</small></p>{index < domains.length - 1 && <i className="domain-line" />}
      </div>;
    })}</div>

    <div className="workspace-grid"><section className="timeline-panel">
      <div className="panel-heading"><div><span className="overline">LIVE EXECUTION</span><h2>Objective timeline</h2></div><span className="live-dot"><i /> Live</span></div>
      {domains.map((domain) => <div className="timeline-domain" key={domain.id}>
        <div className="timeline-domain-title"><span>{domain.id}</span><p>{domain.caption}</p></div>
        <div className="timeline-events">{eventsByDomain[domain.id].length ? eventsByDomain[domain.id].map((event) => <div className={`timeline-event ${event.status.toLowerCase()}`} key={event.id}>
          <span>{eventIcon(event.status)}</span><div><strong>{event.title}</strong>{event.detail && <p>{event.detail}</p>}<time>{new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(new Date(event.occurredAt))}</time></div>
        </div>) : <div className="timeline-empty"><i /><span>Waiting for this phase</span></div>}</div>
      </div>)}
    </section>

    <aside className="decision-column">
      {objective.status === "WAITING_EXTERNAL" && <section className="waiting-card"><span className="pulse-phone"><MessageIcon /></span><span className="overline">WAITING FOR REPLIES</span><h3>Suppliers are responding</h3><p>Quotes sent by SMS will appear automatically. You can keep this page open.</p><div className="signal-bars"><i/><i/><i/><i/><i/></div><button className="secondary-button" disabled={pending} onClick={() => action(`/api/demo/supplier-replies/${objective.id}`, {}, "Two natural-language supplier replies received.")}>Simulate supplier replies</button></section>}

      {objective.quotes.length > 0 && <section className="side-card"><div className="side-card-title"><h3>Supplier quotes</h3><span>{objective.quotes.length} received</span></div><div className="quote-list">{objective.quotes.map((quote) => <div className={quote.eligible ? "eligible" : "rejected"} key={quote.id}><span className="quote-status">{quote.eligible ? <CheckIcon /> : <AlertIcon />}</span><p><strong>{quote.supplierName}</strong><small>{formatMoney(quote.unitPrice, quote.currency)} / unit · {quote.deliveryDate ? new Date(quote.deliveryDate).toLocaleDateString("en", { weekday: "short" }) : "Date pending"}</small>{quote.reason && <em>{quote.reason}</em>}</p></div>)}</div></section>}

      {objective.approval && objective.approval.status === "PENDING" && <section className="approval-card">
        <div className="approval-kicker"><AlertIcon /> Decision required</div><h3>Approve this purchase?</h3>
        <div className="approval-total"><span>Total purchase</span><strong>{formatMoney(objective.approval.total, objective.approval.currency)}</strong></div>
        <dl><div><dt>Supplier</dt><dd>{objective.approval.supplierName}</dd></div><div><dt>Quantity</dt><dd>{objective.approval.quantity.toLocaleString()} units</dd></div><div><dt>Unit price</dt><dd>{formatMoney(objective.approval.unitPrice, objective.approval.currency)}</dd></div><div><dt>Delivery</dt><dd>{objective.approval.deliveryDate ? new Date(objective.approval.deliveryDate).toLocaleDateString("en", { weekday: "long", month: "short", day: "numeric" }) : "Confirmed"}</dd></div></dl>
        <div className="why-box"><SparkIcon /><p><strong>Why this supplier</strong>{objective.approval.reason}</p></div>
        <div className="decision-actions"><button className="secondary-button" disabled={pending} onClick={() => action(`/api/approvals/${objective.approval!.id}/reject`, {}, "Purchase rejected.")}>Reject</button><button className="primary-button" disabled={pending} onClick={() => action(`/api/approvals/${objective.approval!.id}/approve`, {}, "Purchase approved and sent for processing.")}>{pending ? "Working…" : "Approve purchase"}<ArrowIcon /></button></div>
      </section>}

      {objective.purchaseOrderId && <section className={`side-card payment-card ${objective.payment?.status.toLowerCase() ?? "unstarted"}`}>
        <div className="side-card-title"><h3>Manufacturer payment</h3><span>{objective.payment?.provider === "zenopay" ? "ZenoPay" : "Demo"}</span></div>
        <div className="payment-amount"><span>Amount to collect</span><strong>{formatMoney(objective.purchaseOrderTotal ?? 0, objective.purchaseOrderCurrency)}</strong></div>
        <p>{objective.payment?.status === "COMPLETED"
          ? `Payment collected for ${objective.purchaseOrderCode}. No supplier payout is included in this demo.`
          : objective.payment?.status === "PENDING"
            ? "Waiting for the manufacturer to approve the payment prompt. Status updates automatically."
            : objective.payment?.status === "FAILED"
              ? "The collection failed. Check the phone number and try a new payment."
              : `Collect the approved purchase amount before ${objective.purchaseOrderSupplier ?? "the supplier"} delivers.`}</p>
        {objective.payment?.status === "COMPLETED" ? <div className="payment-state success"><CheckIcon /> Collected</div> : <>
          <label htmlFor="manufacturer-phone">Manufacturer mobile-money number <small>Optional if your profile has one</small></label>
          <input id="manufacturer-phone" inputMode="tel" placeholder="0712 345 678" value={paymentPhone} onChange={(event) => setPaymentPhone(event.target.value)} />
          <button className="primary-button" disabled={pending || objective.payment?.status === "PENDING"} onClick={() => action(`/api/purchase-orders/${objective.purchaseOrderId}/payments`, paymentPhone ? { phone: paymentPhone } : {}, objective.payment?.status === "FAILED" ? "A new payment prompt was sent." : "Payment prompt sent to the manufacturer.")}>{objective.payment?.status === "PENDING" ? "Waiting for payment…" : objective.payment?.status === "FAILED" ? "Try payment again" : "Collect payment"}<ArrowIcon /></button>
        </>}
      </section>}

      {!completed && (objective.purchaseOrderId || objective.productionJobId) && <section className="side-card demo-controls"><div className="side-card-title"><h3>Demo controls</h3><span>Simulation</span></div><p>Advance physical events while preserving real inventory transitions.</p>
        {objective.purchaseOrderId && <button disabled={pending} onClick={() => action(`/api/demo/receive/${objective.purchaseOrderId}`, {}, `${objective.purchaseOrderCode ?? "Purchase order"} received. Inventory updated.`)}><BoxIcon /><span><strong>Advance to Monday</strong><small>Receive {objective.purchaseOrderCode ?? "purchase order"}</small></span><ArrowIcon /></button>}
        {objective.productionJobId && <button disabled={pending} onClick={() => action(`/api/demo/complete-production/${objective.productionJobId}`, {}, `${objective.productionJobCode ?? "Production job"} completed.`)}><SparkIcon /><span><strong>Complete production</strong><small>Finish {objective.productionJobCode ?? "production job"}</small></span><ArrowIcon /></button>}
      </section>}

      {completed && <section className="side-card summary-card"><div className="side-card-title"><h3>Outcome summary</h3><span>Verified</span></div><div className="summary-grid">{Object.entries(objective.summary ?? { "Orders covered": 3, "Finished units": "5,000", "Shortage resolved": 1, "Units produced": "4,000" }).map(([key, value]) => <div key={key}><strong>{value}</strong><span>{key}</span></div>)}</div></section>}
    </aside></div>
  </div>;
}
