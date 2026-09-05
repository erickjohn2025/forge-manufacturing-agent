import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { FactoryIcon, SlidersIcon, SparkIcon, TargetIcon } from "./icons";
import { SignOutButton } from "./sign-out-button";

export async function AppShell({ children, current }: { children: React.ReactNode; current: "objectives" | "configuration" }) {
  const session = await auth();
  if (!session) redirect("/login");
  const initials = session.user.name?.split(" ").map((part) => part[0]).join("").slice(0, 2) || "AD";

  return <div className="app-frame">
    <aside className="sidebar">
      <Link href="/objectives" className="brand"><span className="brand-mark"><FactoryIcon /></span><span>manu</span></Link>
      <nav className="main-nav" aria-label="Primary navigation">
        <Link href="/objectives" className={current === "objectives" ? "active" : ""}><TargetIcon /><span>Objectives</span></Link>
        <Link href="/configuration" className={current === "configuration" ? "active" : ""}><SlidersIcon /><span>Configuration</span></Link>
      </nav>
      <div className="agent-status"><span className="status-orbit"><SparkIcon /></span><div><strong>Operations agent</strong><span><i /> Online</span></div></div>
      <div className="sidebar-user">
        <span className="avatar">{initials}</span>
        <div><strong>{session.user.name || "Demo Admin"}</strong><span>{session.user.role.toLowerCase()}</span></div>
        <SignOutButton />
      </div>
    </aside>
    <main className="app-main">
      <header className="mobile-header"><Link href="/objectives" className="brand"><span className="brand-mark"><FactoryIcon /></span><span>manu</span></Link><div className="mobile-actions"><Link href="/configuration"><SlidersIcon /></Link><SignOutButton /></div></header>
      {children}
    </main>
  </div>;
}
