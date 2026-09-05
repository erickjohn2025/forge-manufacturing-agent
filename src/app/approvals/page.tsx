import { AppShell } from "@/components/app-shell";
import { ApprovalsInbox } from "@/components/approvals-inbox";

export default function ApprovalsPage() {
  return <AppShell current="approvals"><div className="page-wrap approvals-page">
    <header className="page-heading"><div><span className="overline">HUMAN GATE</span><h1>Approvals <em>inbox.</em></h1><p>Purchases above the autonomous limit wait here until an approver decides.</p></div></header>
    <ApprovalsInbox />
  </div></AppShell>;
}
