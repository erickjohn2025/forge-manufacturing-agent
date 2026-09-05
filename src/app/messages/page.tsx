import { AppShell } from "@/components/app-shell";
import { MessageLog } from "@/components/message-log";

export default function MessagesPage() {
  return <AppShell current="messages"><div className="page-wrap messages-page">
    <header className="page-heading"><div><span className="overline">SMS OPERATIONS</span><h1>Message <em>log.</em></h1><p>Every inbound and outbound factory SMS, grouped by counterpart.</p></div></header>
    <MessageLog />
  </div></AppShell>;
}
