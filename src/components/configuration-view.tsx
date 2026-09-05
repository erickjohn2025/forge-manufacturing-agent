"use client";

import { useEffect, useState } from "react";
import { apiFetch, formatMoney } from "@/lib/ui-api";
import { CheckIcon, FactoryIcon, MessageIcon, SlidersIcon } from "./icons";

type Config = {
  businessName?: string; currency?: string; timezone?: string; autoPurchaseLimit?: number;
  defaultSafetyStock?: number; messagingMode?: string; smsConfigured?: boolean; inboundNumber?: string;
  smsUsers?: Array<{ name: string; role: string; phone: string }>;
  callbackUrl?: string; callbackStable?: boolean; demoResetEnabled?: boolean;
  manufacturerPaymentPhone?: string; canManagePayments?: boolean; canManagePolicy?: boolean; paymentMode?: string;
};

export function ConfigurationView() {
  const [config, setConfig] = useState<Config>({ businessName: "Kilimanjaro Foods Ltd", currency: "TZS", timezone: "Africa/Dar_es_Salaam", autoPurchaseLimit: 250000, defaultSafetyStock: 0, messagingMode: "Simulator", smsConfigured: false });
  const [resetting, setResetting] = useState(false);
  const [resetNotice, setResetNotice] = useState("");
  const [limit, setLimit] = useState(250000);
  const [safety, setSafety] = useState(0);
  const [saving, setSaving] = useState(false);
  const [policyError, setPolicyError] = useState("");
  const [policyNotice, setPolicyNotice] = useState("");
  const [paymentPhone, setPaymentPhone] = useState("");
  const [paymentNotice, setPaymentNotice] = useState("");
  const [savingPayment, setSavingPayment] = useState(false);
  useEffect(() => {
    apiFetch<Config>("/api/configuration").then((value) => {
      setConfig((old) => ({ ...old, ...value }));
      if (value.autoPurchaseLimit !== undefined) setLimit(value.autoPurchaseLimit);
      if (value.defaultSafetyStock !== undefined) setSafety(value.defaultSafetyStock);
      setPaymentPhone(value.manufacturerPaymentPhone ?? "");
    }).catch(() => {});
  }, []);

  async function savePaymentPhone() {
    try {
      setSavingPayment(true); setPaymentNotice("");
      const updated = await apiFetch<{ manufacturerPaymentPhone: string }>("/api/configuration", { method: "PATCH", body: JSON.stringify({ manufacturerPaymentPhone: paymentPhone }) });
      setPaymentPhone(updated.manufacturerPaymentPhone);
      setConfig((old) => ({ ...old, manufacturerPaymentPhone: updated.manufacturerPaymentPhone }));
      setPaymentNotice("Manufacturer payment number saved for this business.");
    } catch (error) {
      setPaymentNotice(error instanceof Error ? error.message : "Could not save the payment number");
    } finally { setSavingPayment(false); }
  }

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
    <section className="config-card"><div className="config-title"><span><SlidersIcon /></span><div><h3>Autonomy policy</h3><p>Boundaries your agent will always respect.</p></div></div>
      <form className="policy-form" onSubmit={async (event) => {
        event.preventDefault();
        const previous = config;
        setSaving(true); setPolicyError(""); setPolicyNotice("");
        setConfig((old) => ({ ...old, autoPurchaseLimit: limit, defaultSafetyStock: safety }));
        try {
          const next = await apiFetch<Pick<Config, "autoPurchaseLimit" | "defaultSafetyStock">>("/api/configuration", { method: "PATCH", body: JSON.stringify({ autoPurchaseLimit: limit, defaultSafetyStock: safety }) });
          setConfig((old) => ({ ...old, ...next }));
          setPolicyNotice("Autonomy policy updated.");
        } catch (cause) {
          setConfig(previous);
          setLimit(previous.autoPurchaseLimit ?? 250000);
          setSafety(previous.defaultSafetyStock ?? 0);
          setPolicyError(cause instanceof Error ? cause.message : "Could not update policy.");
        } finally { setSaving(false); }
      }}>
        <label>Autonomous purchase limit<input type="number" min={0} step={1} value={limit} disabled={!config.canManagePolicy || saving} onChange={(event) => setLimit(Number(event.target.value))} /></label>
        <small>Purchases above this amount require an approver. Preview: {formatMoney(limit, config.currency)}</small>
        <label>Default safety stock<input type="number" min={0} step={1} value={safety} disabled={!config.canManagePolicy || saving} onChange={(event) => setSafety(Number(event.target.value))} /></label>
        <div className="policy-line"><span>Approved suppliers only</span><strong className="green-label"><CheckIcon /> Enforced</strong></div>
        {policyError && <div className="banner error">{policyError}</div>}
        {policyNotice && <div className="banner success">{policyNotice}</div>}
        <button className="primary-button" disabled={!config.canManagePolicy || saving} type="submit">{saving ? "Saving…" : config.canManagePolicy ? "Save policy" : "Admin access required"}</button>
      </form>
    </section>
    <section className="config-card"><div className="config-title"><span><MessageIcon /></span><div><h3>SMS operations</h3><p>Run the factory from registered phones.</p></div></div><div className="connection-row"><span className={config.smsConfigured ? "connected" : "simulator"}><i />{config.smsConfigured ? "Connected" : "Demo mode"}</span><div><strong>Africa’s Talking SMS</strong><small>Inbound number: {config.inboundNumber ?? "Not configured"}</small></div></div><div className="config-note"><strong>Commands</strong><br />Send an objective in natural language, or text STATUS, APPROVE [RFQ], REJECT [RFQ], RECEIVED [PO], or JOB [PJ] FINISHED, PRODUCED [quantity].<br /><br />Registered staff: {config.smsUsers?.map((user) => `${user.name} (${user.role}, ${user.phone})`).join("; ") || "None"}<br /><br /><strong>Inbound callback</strong><br />{config.callbackUrl ?? "Set PUBLIC_WEBHOOK_BASE_URL to an HTTPS deployment or tunnel."}<br />{config.callbackUrl && <span className={config.callbackStable ? "callback-stable" : "callback-temporary"}>{config.callbackStable ? "Stable hostname" : "Temporary tunnel — replace before the live demo"}</span>}</div></section>
    <section className="config-card payment-config-card"><div className="config-title"><span><FactoryIcon /></span><div><h3>Manufacturer payments</h3><p>Business-specific mobile-money collection.</p></div></div><div className="connection-row"><span className={config.paymentMode === "ZenoPay" ? "connected" : "simulator"}><i />{config.paymentMode ?? "Demo"}</span><div><strong>Collection number</strong><small>Used when funding an approved purchase order.</small></div></div><label htmlFor="config-payment-phone">Manufacturer mobile-money number</label><input id="config-payment-phone" inputMode="tel" value={paymentPhone} disabled={!config.canManagePayments || savingPayment} onChange={(event) => setPaymentPhone(event.target.value)} /><button className="primary-button" disabled={!config.canManagePayments || savingPayment || !paymentPhone} onClick={savePaymentPhone}>{savingPayment ? "Saving…" : "Save payment number"}</button>{paymentNotice && <p className="config-save-notice">{paymentNotice}</p>}<p className="config-note">Each merchant has their own number. Payment details remain scoped to the active business.</p></section>
    {config.demoResetEnabled && <section className="config-card business-card demo-reset-card"><div className="config-icon"><SlidersIcon /></div><div><span className="overline">DEMO CONTROL</span><h2>Restore the Friday hero baseline</h2><p>Clears only this tenant’s demo operations and recreates the exact 5,000-unit scenario.</p>{resetNotice && <p className="reset-notice">{resetNotice}</p>}</div><button className="secondary-button" disabled={resetting} onClick={resetHero}>{resetting ? "Resetting…" : "Reset hero state"}</button></section>}
  </div>;
}
