import { AppShell } from "@/components/app-shell";
import { ConfigurationView } from "@/components/configuration-view";

export default function ConfigurationPage() {
  return <AppShell current="configuration"><div className="page-wrap configuration-page"><header className="page-heading"><div><span className="overline">FACTORY SETTINGS</span><h1>Operational <em>guardrails.</em></h1><p>Review the policies and connections your agent uses to act safely.</p></div></header><ConfigurationView /></div></AppShell>;
}
