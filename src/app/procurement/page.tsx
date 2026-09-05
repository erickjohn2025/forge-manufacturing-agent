import { AppShell } from "@/components/app-shell";
import { ProcurementPipeline } from "@/components/procurement-pipeline";

export default function ProcurementPage() {
  return <AppShell current="procurement"><div className="page-wrap procurement-page">
    <header className="page-heading"><div><span className="overline">SOURCE</span><h1>Procurement <em>pipeline.</em></h1><p>RFQ, quote, purchase order and receipt — one chain, still read-only.</p></div></header>
    <ProcurementPipeline />
  </div></AppShell>;
}
