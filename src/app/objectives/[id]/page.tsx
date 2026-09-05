import { AppShell } from "@/components/app-shell";
import { ObjectiveWorkspace } from "@/components/objective-workspace";

export default async function ObjectivePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AppShell current="objectives"><div className="page-wrap"><ObjectiveWorkspace objectiveId={id} /></div></AppShell>;
}
