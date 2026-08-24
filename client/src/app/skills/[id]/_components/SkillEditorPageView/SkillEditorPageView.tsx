/* /skills/:id — same Skills Lab layout with the selected skill. */
"use client";

import { useParams } from "next/navigation";
import { SkillsListView } from "../../../_components/SkillsListView/SkillsListView";

export function SkillEditorPageView() {
  const params = useParams<{ id: string }>();
  return <SkillsListView selectedId={params.id} />;
}
