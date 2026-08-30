import type { ConventionCandidate } from "@devdigest/shared";

/** Format evidence path for display: `path:23-31` or `path:23`. */
export function formatEvidenceLabel(
  path: string,
  start: number | null,
  end: number | null,
): string {
  if (start == null) return path;
  if (end == null || end === start) return `${path}:${start}`;
  return `${path}:${start}-${end}`;
}

/** Confidence bar colour thresholds from the spec. */
export function confidenceColor(confidence: number): string {
  if (confidence >= 0.85) return "var(--ok)";
  if (confidence >= 0.6) return "var(--warn)";
  return "var(--text-muted)";
}

export function countAccepted(candidates: ConventionCandidate[]): number {
  return candidates.filter((c) => c.status === "accepted").length;
}

/** Relative time for "last scan 1h ago" — coarse, English-only for now. */
export function formatRelativeTime(iso: string, now = Date.now()): string {
  const ms = now - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "just now";
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export type PreconditionReason = "not_cloned" | "not_indexed" | "missing_provider_key";

export function preconditionReason(details: unknown): PreconditionReason | null {
  if (!details || typeof details !== "object") return null;
  const reason = (details as { reason?: string }).reason;
  if (reason === "not_cloned" || reason === "not_indexed" || reason === "missing_provider_key") {
    return reason;
  }
  return null;
}
