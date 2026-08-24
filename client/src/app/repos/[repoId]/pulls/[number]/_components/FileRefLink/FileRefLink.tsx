/* FileRefLink — one file reference from the brief, rendered as a link into the
   Files changed tab at that file and line (AC-29).

   ONE component for both surfaces that render a reference — the review-focus
   rows and the risk-area rows — because two lists required to behave
   identically drift when each keeps its own copy (client/INSIGHTS.md:393-417). */
"use client";

import React from "react";
import { shortPath } from "../BlastCard/helpers";
import { fileRefHref, parseFileRef } from "./helpers";
import { s } from "./styles";

export function FileRefLink({
  fileRef,
  repoId,
  prNumber,
  line: attachedLine,
}: {
  fileRef: string;
  repoId: string;
  prNumber: number;
  /** The line the SERVER attached to a review-focus entry (AC-40). Absent is
   *  a normal value — the row then falls back to any line the reference itself
   *  carries, and with neither the link opens the file alone, exactly as it
   *  did before. */
  line?: number | null;
}) {
  const { path, line: refLine } = parseFileRef(fileRef);
  const line = attachedLine ?? refLine;
  if (!path) {
    return (
      <span style={s.plain} title={fileRef}>
        {fileRef}
      </span>
    );
  }
  // The whole path is never lost: it stays in the href and in `title`, while
  // the row shows the last three segments (AC-30).
  return (
    <a
      className="dd-fileref"
      style={s.link}
      href={fileRefHref(repoId, prNumber, path, line)}
      title={fileRef}
    >
      {shortPath(path, 3)}
      {line != null ? `:${line}` : ""}
    </a>
  );
}
