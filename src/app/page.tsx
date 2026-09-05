import { AppShell } from "@/components/app-shell";
import { FloorDashboard } from "@/components/floor-dashboard";

export default function FloorPage() {
  return <AppShell current="floor"><div className="page-wrap floor-page">
    <header className="page-heading"><div><span className="overline">FACTORY FLOOR</span><h1>What needs <em>attention.</em></h1><p>Orders, stock, approvals and the latest agent actions — without opening an objective.</p></div><span className="live-pill"><i /> Live operations</span></header>
    <FloorDashboard />
  </div></AppShell>;
}
