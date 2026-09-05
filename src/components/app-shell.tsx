import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { FactoryIcon, FloorIcon, MessageIcon, PipelineIcon, SlidersIcon, SparkIcon, StampIcon, TargetIcon } from "./icons";
import { SignOutButton } from "./sign-out-button";

export type AppSection = "floor" | "objectives" | "approvals" | "procurement" | "messages" | "configuration";

const nav = [
  { href: "/", id: "floor" as const, label: "Floor", Icon: FloorIcon },
  { href: "/objectives", id: "objectives" as const, label: "Objectives", Icon: TargetIcon },
  { href: "/approvals", id: "approvals" as const, label: "Approvals", Icon: StampIcon },
  { href: "/procurement", id: "procurement" as const, label: "Procurement", Icon: PipelineIcon },
  { href: "/messages", id: "messages" as const, label: "Messages", Icon: MessageIcon },
  { href: "/configuration", id: "configuration" as const, label: "Configuration", Icon: SlidersIcon },
];

export async function AppShell({ children, current }: { children: React.ReactNode; current: AppSection }) {
  const session = await auth();
  if (!session) redirect("/login");
  const initials = session.user.name?.split(" ").map((part) => part[0]).join("").slice(0, 2) || "AD";

  return <div className="app-frame">
    <aside className="sidebar">
      <Link href="/" className="brand"><span className="brand-mark"><FactoryIcon /></span><span>manu</span></Link>
      <nav className="main-nav" aria-label="Primary navigation">
        {nav.map(({ href, id, label, Icon }) => <Link href={href} className={current === id ? "active" : ""} aria-current={current === id ? "page" : undefined} key={id}><Icon /><span>{label}</span></Link>)}
      </nav>
      <div className="agent-status"><span className="status-orbit"><SparkIcon /></span><div><strong>Operations agent</strong><span><i /> Online</span></div></div>
      <div className="sidebar-user">
        <span className="avatar">{initials}</span>
        <div><strong>{session.user.name || "Demo Admin"}</strong><span>{session.user.role.toLowerCase()}</span></div>
        <SignOutButton />
      </div>
    </aside>
    <main className="app-main">
      <header className="mobile-header"><Link href="/" className="brand"><span className="brand-mark"><FactoryIcon /></span><span>manu</span></Link><nav className="mobile-actions" aria-label="Primary navigation">{nav.map(({ href, id, label, Icon }) => <Link href={href} className={current === id ? "active" : ""} aria-current={current === id ? "page" : undefined} aria-label={label} key={id}><Icon /></Link>)}<SignOutButton /></nav></header>
      {children}
    </main>
  </div>;
}
