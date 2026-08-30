import type { SmartDiffRole } from "@devdigest/shared";
import { AUTO_EXPAND_MAX_LINES } from "../constants";

/** Initial / derived open state for a FileCard. Boilerplate always starts
 *  collapsed. In Smart order a file with findings starts open even when it
 *  exceeds AUTO_EXPAND_MAX_LINES. Original order keeps the size rule. */
export function fileCardStartsOpen(input: {
  role?: SmartDiffRole | null;
  smart?: boolean;
  changedLines: number;
  findingsCount: number;
}): boolean {
  if (input.role === "boilerplate") return false;
  if (input.smart && input.findingsCount > 0) return true;
  return input.changedLines <= AUTO_EXPAND_MAX_LINES;
}
