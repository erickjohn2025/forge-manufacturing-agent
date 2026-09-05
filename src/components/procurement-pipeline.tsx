"use client";

import { useEffect, useState } from "react";
import { apiFetch, formatMoney, friendlyState, type ProcurementView } from "@/lib/ui-api";
import { AlertIcon, CheckIcon } from "./icons";

export function ProcurementPipeline() {
  const [data, setData] = useState<ProcurementView | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    apiFetch<ProcurementView>("/api/procurement").then(setData).catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load procurement."));
  }, []);

  if (!data && !error) return <div className="list-skeleton"><i /><i /><i /></div>;
  if (!data) return <div className="page-error"><AlertIcon /><h2>Procurement unavailable</h2><p>{error}</p></div>;

  return <div className="procurement-columns">
    <section className="floor-card">
      <div className="section-title"><h2>RFQs</h2><span>{data.rfqs.length}</span></div>
      {data.rfqs.length === 0 ? <p className="muted-copy">No requests for quotation.</p> : data.rfqs.map((rfq) => <article className="pipe-card" key={rfq.id}>
        <strong>{rfq.code}</strong>
        <small>{rfq.materialName} · {rfq.quantity.toLocaleString()} · {friendlyState(rfq.status)}</small>
        <p>{rfq.recipients.map((recipient) => recipient.supplierName).join(", ") || "No recipients"}</p>
      </article>)}
    </section>
    <section className="floor-card">
      <div className="section-title"><h2>Quotes</h2><span>{data.rfqs.reduce((sum, rfq) => sum + rfq.quotes.length, 0)}</span></div>
      {data.rfqs.every((rfq) => rfq.quotes.length === 0) ? <p className="muted-copy">Waiting for supplier replies.</p> : data.rfqs.flatMap((rfq) => rfq.quotes.map((quote) => <article className={`pipe-card ${quote.eligible ? "eligible" : "rejected"}`} key={quote.id}>
        <strong>{quote.supplierName}</strong>
        <small>{rfq.code} · {formatMoney(quote.unitPrice, quote.currency)} · {new Date(quote.deliveryDate).toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric" })}</small>
        {quote.eligible ? <em className="ok-label">Eligible</em> : <em>{quote.rejectionReason || "Rejected by hard constraints"}</em>}
      </article>))}
    </section>
    <section className="floor-card">
      <div className="section-title"><h2>Purchase orders</h2><span>{data.purchaseOrders.length}</span></div>
      {data.purchaseOrders.length === 0 ? <p className="muted-copy">No purchase orders issued.</p> : data.purchaseOrders.map((po) => <article className="pipe-card" key={po.id}>
        <strong>{po.code}</strong>
        <small>{po.supplierName} · {formatMoney(po.total, po.currency)} · {friendlyState(po.status)}</small>
        {po.lines.map((line) => {
          const progress = line.quantity <= 0 ? 0 : Math.min(100, Math.round((line.receivedQuantity / line.quantity) * 100));
          return <div className="receive-bar" key={line.id}>
            <span>{line.materialName} · {line.receivedQuantity.toLocaleString()} / {line.quantity.toLocaleString()}</span>
            <i><b style={{ width: `${progress}%` }} /></i>
          </div>;
        })}
      </article>)}
    </section>
    <section className="floor-card">
      <div className="section-title"><h2>Receipts</h2><span>{data.receipts.length}</span></div>
      {data.receipts.length === 0 ? <p className="muted-copy">No goods receipts yet.</p> : data.receipts.map((receipt) => <article className="pipe-card" key={receipt.id}>
        <span className="quote-status"><CheckIcon /></span>
        <strong>{receipt.purchaseOrderCode}</strong>
        <small>{receipt.quantity.toLocaleString()} received · {new Date(receipt.receivedAt).toLocaleDateString("en", { month: "short", day: "numeric" })}</small>
      </article>)}
    </section>
  </div>;
}
