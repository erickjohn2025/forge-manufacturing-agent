"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch, friendlyState, type MessageLogView, type MessageView } from "@/lib/ui-api";
import { AlertIcon, MessageIcon } from "./icons";

export function MessageLog() {
  const [items, setItems] = useState<MessageView[]>([]);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load(cursor?: string) {
    try {
      setLoading(true);
      const page = await apiFetch<MessageLogView>(cursor ? `/api/messages?cursor=${cursor}` : "/api/messages");
      setItems((current) => cursor ? [...current, ...page.items] : page.items);
      setNextCursor(page.nextCursor);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load messages.");
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  const threads = useMemo(() => {
    const groups = new Map<string, MessageView[]>();
    for (const message of items) {
      const list = groups.get(message.counterpart) ?? [];
      list.push(message);
      groups.set(message.counterpart, list);
    }
    return [...groups.entries()].map(([counterpart, messages]) => ({
      counterpart,
      messages: [...messages].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    }));
  }, [items]);

  if (loading && items.length === 0 && !error) return <div className="list-skeleton"><i /><i /><i /></div>;
  if (error && items.length === 0) return <div className="page-error"><AlertIcon /><h2>Messages unavailable</h2><p>{error}</p></div>;
  if (threads.length === 0) return <div className="empty-state"><span><MessageIcon /></span><h3>No SMS yet</h3><p>Inbound and outbound factory messages will thread here by phone number.</p></div>;

  return <div className="message-log">
    {threads.map((thread) => <section className="message-thread" key={thread.counterpart}>
      <header><MessageIcon /><strong>{thread.counterpart}</strong><span>{thread.messages.length} messages</span></header>
      <ol>
        {thread.messages.map((message) => <li className={`bubble ${message.direction.toLowerCase()}`} key={message.id}>
          <p>{message.body}</p>
          <div className="bubble-meta">
            <span className="status-pill">{message.channel}</span>
            <span className={`status-pill ${message.status.toLowerCase()}`}>{friendlyState(message.status)}</span>
            <time>{new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(message.createdAt))}</time>
          </div>
        </li>)}
      </ol>
    </section>)}
    {nextCursor && <button className="secondary-button" disabled={loading} onClick={() => load(nextCursor)}>{loading ? "Loading…" : "Load older messages"}</button>}
  </div>;
}
