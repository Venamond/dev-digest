/* /agents/:id — same Agents Lab layout with the selected agent. */
"use client";

import { useParams } from "next/navigation";
import { AgentsListView } from "../../../_components/AgentsListView/AgentsListView";

export function AgentEditorPageView() {
  const params = useParams<{ id: string }>();
  return <AgentsListView selectedId={params.id} />;
}
