"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch, friendlyState, normalizeObjective, type ObjectiveView } from "@/lib/ui-api";
import { ArrowIcon, CheckIcon, ClockIcon, TargetIcon } from "./icons";

export function ObjectiveList() {
  const [items, setItems] = useState<ObjectiveView[]>([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { apiFetch<unknown>("/api/objectives").then((raw: any) => {
    const list = Array.isArray(raw) ? raw : raw.objectives ?? [];
    setItems(list.map(normalizeObjective));
  }).catch(() => {}).finally(() => setLoaded(true)); }, []);
  if (!loaded) return <div className="list-skeleton"><i/><i/><i/></div>;
  if (!items.length) return <div className="empty-state"><span><TargetIcon /></span><h3>No objectives yet</h3><p>Your factory’s active work will appear here.</p></div>;
  return <div className="objective-list">{items.map((item) => <Link href={`/objectives/${item.id}`} key={item.id}>
    <span className={`objective-state-dot ${item.status.toLowerCase()}`}>{item.status === "COMPLETE" ? <CheckIcon /> : <ClockIcon />}</span>
    <div><h3>{item.text}</h3><p>{friendlyState(item.status)} · {new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(item.createdAt))}</p></div><ArrowIcon />
  </Link>)}</div>;
}
