"use client";

import { useEffect, useState } from "react";
import { apiFetch, formatMoney } from "@/lib/ui-api";
import { CheckIcon, FactoryIcon, MessageIcon, SlidersIcon } from "./icons";

type Config = {
  businessName?: string; currency?: string; timezone?: string; autoPurchaseLimit?: number;
  defaultSafetyStock?: number; messagingMode?: string; smsConfigured?: boolean; inboundNumber?: string;
  smsUsers?: Array<{ name: string; role: string; phone: string }>;
  callbackUrl?: string; callbackStable?: boolean; demoResetEnabled?: boolean;
};

export function ConfigurationView() {
  const [config, setConfig] = useState<Config>({ businessName: "Kilimanjaro Foods Ltd", currency: "TZS", timezone: "Africa/Dar_es_Salaam", autoPurchaseLimit: 250000, defaultSafetyStock: 0, messagingMode: "Simulator", smsConfigured: false });
  const [resetting, setResetting] = useState(false);
  const [resetNotice, setResetNotice] = useState("");
  useEffect(() => { apiFetch<Config>("/api/configuration").then((value) => setConfig((old) => ({ ...old, ...value }))).catch(() => {}); }, []);

  async function resetHero() {
    if (!window.confirm("Reset all demo objectives, messages and transactions to the clean Friday hero baseline?")) return;
    try {
      setResetting(true); setResetNotice("");
      await apiFetch("/api/demo/reset", { method: "POST", body: JSON.stringify({ confirmation: "RESET HERO" }) });
      setResetNotice("Hero state restored: 5,000 demand, 1,000 finished goods and a 1,400 packaging shortage.");
    } catch (error) {
      setResetNotice(error instanceof Error ? error.message : "Reset failed");
    } finally { setResetting(false); }
  }

  return <div className="configuration-grid">
    <section className="config-card business-card"><div className="config-icon"><FactoryIcon /></div><div><span className="overline">BUSINESS</span><h2>{config.businessName}</h2><p>The operating context used for every objective and transaction.</p></div><dl><div><dt>Currency</dt><dd>{config.currency}</dd></div><div><dt>Timezone</dt><dd>{config.timezone}</dd></div></dl></section>
    <section className="config-card"><div className="config-title"><span><SlidersIcon /></span><div><h3>Autonomy policy</h3><p>Boundaries your agent will always respect.</p></div></div><div className="policy-value"><span>Autonomous purchase limit</span><strong>{formatMoney(config.autoPurchaseLimit ?? 250000, config.currency)}</strong><small>Purchases above this amount require an approver.</small></div><div className="policy-line"><span>Default safety stock</span><strong>{config.defaultSafetyStock} units</strong></div><div className="policy-line"><span>Approved suppliers only</span><strong className="green-label"><CheckIcon /> Enforced</strong></div></section>
    <section className="config-card"><div className="config-title"><span><MessageIcon /></span><div><h3>SMS operations</h3><p>Run the factory from registered phones.</p></div></div><div className="connection-row"><span className={config.smsConfigured ? "connected" : "simulator"}><i />{config.smsConfigured ? "Connected" : "Demo mode"}</span><div><strong>Africa’s Talking SMS</strong><small>Inbound number: {config.inboundNumber ?? "Not configured"}</small></div></div><div className="config-note"><strong>Commands</strong><br />Send an objective in natural language, or text STATUS, APPROVE [RFQ], REJECT [RFQ], RECEIVED [PO], or JOB [PJ] FINISHED, PRODUCED [quantity].<br /><br />Registered staff: {config.smsUsers?.map((user) => `${user.name} (${user.role}, ${user.phone})`).join("; ") || "None"}<br /><br /><strong>Inbound callback</strong><br />{config.callbackUrl ?? "Set PUBLIC_WEBHOOK_BASE_URL to an HTTPS deployment or tunnel."}<br />{config.callbackUrl && <span className={config.callbackStable ? "callback-stable" : "callback-temporary"}>{config.callbackStable ? "Stable hostname" : "Temporary tunnel — replace before the live demo"}</span>}</div></section>
    {config.demoResetEnabled && <section className="config-card business-card demo-reset-card"><div className="config-icon"><SlidersIcon /></div><div><span className="overline">DEMO CONTROL</span><h2>Restore the Friday hero baseline</h2><p>Clears only this tenant’s demo operations and recreates the exact 5,000-unit scenario.</p>{resetNotice && <p className="reset-notice">{resetNotice}</p>}</div><button className="secondary-button" disabled={resetting} onClick={resetHero}>{resetting ? "Resetting…" : "Reset hero state"}</button></section>}
  </div>;
}
