"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch, friendlyState, type FloorView } from "@/lib/ui-api";
import { AlertIcon, BoxIcon, CheckIcon, ClockIcon, StampIcon, TargetIcon } from "./icons";

function eventIcon(status: string) {
  if (status === "COMPLETED") return <CheckIcon />;
  if (status === "FAILED") return <AlertIcon />;
  return <ClockIcon />;
}

export function FloorDashboard() {
  const [floor, setFloor] = useState<FloorView | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    apiFetch<FloorView>("/api/floor").then(setFloor).catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load the factory floor."));
  }, []);

  if (!floor && !error) return <div className="list-skeleton"><i /><i /><i /><i /></div>;
  if (!floor) return <div className="page-error"><AlertIcon /><h2>Floor unavailable</h2><p>{error}</p></div>;

  return <div className="floor-dashboard">
    <div className="stat-row">
      {[
        { label: "Orders due", value: floor.counts.ordersDue, hint: "Next 7 days", Icon: TargetIcon },
        { label: "Shortages", value: floor.counts.shortages, hint: "Below safety stock", Icon: AlertIcon, tone: floor.counts.shortages ? "warn" : "" },
        { label: "Pending approvals", value: floor.counts.pendingApprovals, hint: "Human decision", Icon: StampIcon },
        { label: "Jobs in progress", value: floor.counts.activeJobs, hint: "Active production", Icon: BoxIcon },
      ].map(({ label, value, hint, Icon, tone }) => <article className={`stat-tile ${tone ?? ""}`} key={label}>
        <span><Icon /></span><div><strong>{value}</strong><small>{label}</small><em>{hint}</em></div>
      </article>)}
    </div>

    <div className="floor-grid">
      <section className="floor-card">
        <div className="section-title"><h2>Orders due</h2><span>{floor.orders.length} in window</span></div>
        {floor.orders.length === 0 ? <div className="empty-state"><span><TargetIcon /></span><h3>No orders due this week</h3><p>Confirmed demand in the next seven days will appear here.</p></div> : <table className="floor-table">
          <caption className="sr-only">Customer orders due in the next seven days</caption>
          <thead><tr><th scope="col">Order</th><th scope="col">Customer</th><th scope="col">Due</th><th scope="col">Lines</th><th scope="col">Allocated</th><th scope="col">Status</th></tr></thead>
          <tbody>{floor.orders.map((order) => <tr key={order.id}>
            <th scope="row">{order.code}</th>
            <td>{order.customer}</td>
            <td>{new Date(order.dueAt).toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric" })}</td>
            <td>{order.lineCount}</td>
            <td>{order.allocated.toLocaleString()} / {order.ordered.toLocaleString()}</td>
            <td><span className={`status-pill ${order.status.toLowerCase()}`}>{friendlyState(order.status)}</span></td>
          </tr>)}</tbody>
        </table>}
      </section>

      <section className="floor-card">
        <div className="section-title"><h2>Stock position</h2><span>{floor.counts.shortages} short</span></div>
        {floor.stock.length === 0 ? <div className="empty-state"><span><BoxIcon /></span><h3>No stock records</h3><p>Finished goods and materials will list here.</p></div> : <ul className="stock-list">{floor.stock.map((item) => <li className={item.shortage ? (item.available <= 0 ? "critical" : "short") : ""} key={`${item.kind}-${item.id}`}>
          <div><strong>{item.name}</strong><small>{item.sku} · {item.kind === "PRODUCT" ? "Finished" : "Material"}</small></div>
          <p><strong>{item.available.toLocaleString()} {item.unit}</strong><small>Safety {item.safetyStock.toLocaleString()}</small></p>
        </li>)}</ul>}
      </section>

      <section className="floor-card activity-card">
        <div className="section-title"><h2>Recent agent activity</h2><Link href="/objectives">All objectives</Link></div>
        {floor.events.length === 0 ? <div className="timeline-empty"><i /><span>No agent actions yet</span></div> : <div className="timeline-events floor-activity">{floor.events.map((event) => <div className={`timeline-event ${event.status.toLowerCase()}`} key={event.id}>
          <span>{eventIcon(event.status)}</span>
          <div><strong>{event.title}</strong>{event.detail && <p>{event.detail}</p>}<time>{event.domain} · {new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(event.occurredAt))}</time></div>
        </div>)}</div>}
      </section>
    </div>
  </div>;
}
