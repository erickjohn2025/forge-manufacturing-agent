"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { apiFetch, formatMoney, type ApprovalView } from "@/lib/ui-api";
import { AlertIcon, ArrowIcon, CheckIcon, StampIcon } from "./icons";

export function ApprovalsInbox() {
  const [approvals, setApprovals] = useState<ApprovalView[] | null>(null);
  const [error, setError] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const load = useCallback(async () => {
    try { setApprovals(await apiFetch<ApprovalView[]>("/api/approvals")); setError(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load approvals."); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function decide(id: string, decision: "approve" | "reject") {
    startTransition(async () => {
      try {
        setPendingId(id); setError("");
        await apiFetch(`/api/approvals/${id}/${decision}`, { method: "POST", body: JSON.stringify({}) });
        await load();
      } catch (cause) { setError(cause instanceof Error ? cause.message : "The decision could not be recorded."); }
      finally { setPendingId(null); }
    });
  }

  if (!approvals && !error) return <div className="list-skeleton"><i /><i /><i /></div>;
  if (!approvals) return <div className="page-error"><AlertIcon /><h2>Approvals unavailable</h2><p>{error}</p><button onClick={() => load()}>Try again</button></div>;
  if (approvals.length === 0) return <div className="empty-state approvals-empty"><span><CheckIcon /></span><h3>Queue is clear</h3><p>There are no pending purchases waiting for an approver.</p></div>;

  return <div className="approvals-inbox">
    {error && <div className="banner error"><AlertIcon />{error}</div>}
    {approvals.map((approval) => <section className="approval-card" key={approval.id}>
      <div className="approval-kicker"><StampIcon /> Purchase approval</div>
      <h3>{approval.supplierName}</h3>
      <div className="approval-total"><span>Total purchase</span><strong>{formatMoney(approval.total, approval.currency)}</strong></div>
      <dl>
        <div><dt>Material</dt><dd>{approval.materialName ?? "Material"}</dd></div>
        <div><dt>Quantity</dt><dd>{approval.quantity.toLocaleString()} units</dd></div>
        <div><dt>Unit price</dt><dd>{formatMoney(approval.unitPrice, approval.currency)}</dd></div>
        <div><dt>Delivery</dt><dd>{approval.deliveryDate ? new Date(approval.deliveryDate).toLocaleDateString("en", { weekday: "long", month: "short", day: "numeric" }) : "Confirmed"}</dd></div>
      </dl>
      <div className="why-box"><AlertIcon /><p><strong>Why this supplier</strong>{approval.reason}</p></div>
      {approval.objectiveId && <Link className="approval-objective-link" href={`/objectives/${approval.objectiveId}`}>{approval.objectiveText ?? "Open objective"}</Link>}
      <div className="decision-actions">
        <button className="secondary-button" aria-label={`Reject purchase from ${approval.supplierName}`} disabled={pendingId === approval.id} onClick={() => decide(approval.id, "reject")}>Reject</button>
        <button className="primary-button" aria-label={`Approve purchase from ${approval.supplierName}`} disabled={pendingId === approval.id} onClick={() => decide(approval.id, "approve")}>{pendingId === approval.id ? "Working…" : "Approve purchase"}<ArrowIcon /></button>
      </div>
    </section>)}
  </div>;
}
