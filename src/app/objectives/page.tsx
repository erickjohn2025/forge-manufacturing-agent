import { AppShell } from "@/components/app-shell";
import { ObjectiveComposer } from "@/components/objective-composer";
import { ObjectiveList } from "@/components/objective-list";

export default function ObjectivesPage() {
  return <AppShell current="objectives"><div className="page-wrap dashboard-page">
    <header className="page-heading"><div><span className="overline">COMMAND CENTER</span><h1>Good morning, <em>operator.</em></h1><p>One outcome at a time. Your agent handles the coordination.</p></div><span className="live-pill"><i /> Systems ready</span></header>
    <ObjectiveComposer />
    <section className="recent-section"><div className="section-title"><h2>Recent objectives</h2><span>Live operational history</span></div><ObjectiveList /></section>
  </div></AppShell>;
}
