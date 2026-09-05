"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/ui-api";
import { ArrowIcon, SparkIcon } from "./icons";

const suggestions = ["Get Friday’s orders ready", "Check next week’s production readiness", "Resolve material shortages"];

export function ObjectiveComposer() {
  const router = useRouter();
  const [objective, setObjective] = useState("Make sure we’re ready to fulfil all orders due Friday.");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault(); if (!objective.trim()) return;
    startTransition(async () => {
      try {
        setError("");
        const result = await apiFetch<{ id?: string; objective?: { id: string } }>("/api/objectives", { method: "POST", body: JSON.stringify({ text: objective.trim(), prompt: objective.trim() }) });
        const id = result.id ?? result.objective?.id;
        if (!id) throw new Error("The objective was created without an ID.");
        router.push(`/objectives/${id}`);
      } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not start the objective."); }
    });
  }

  return <div className="composer-card">
    <div className="composer-glow" />
    <div className="composer-heading"><span><SparkIcon /></span><div><p>WHAT NEEDS TO GET DONE?</p><h2>Set an outcome for your factory.</h2></div></div>
    <form onSubmit={submit}>
      <textarea value={objective} onChange={(event) => setObjective(event.target.value)} rows={3} aria-label="Manufacturing objective" />
      <div className="composer-footer"><span>Manu will plan and coordinate the work</span><button className="primary-button" disabled={pending || !objective.trim()}>{pending ? "Starting…" : "Start objective"}<ArrowIcon /></button></div>
    </form>
    {error && <div className="form-error" role="alert">{error}</div>}
    <div className="suggestion-row"><span>Try:</span>{suggestions.map((item) => <button key={item} type="button" onClick={() => setObjective(item)}>{item}</button>)}</div>
  </div>;
}
