import { displayModelName } from "@/lib/model-label";
import { MODEL_COLOR } from "./constants";

/** Resolve the chip colour for an agent's model (unknown → secondary token). */
export function modelColor(model: string): string {
  const short = displayModelName(model);
  return MODEL_COLOR[model] ?? MODEL_COLOR[short] ?? "var(--text-secondary)";
}

/** Soft tint behind the model chip — hex + alpha, or a surface token for CSS vars. */
export function modelChipBg(color: string): string {
  if (color.startsWith("#") && (color.length === 7 || color.length === 4)) return `${color}1a`;
  return "var(--bg-surface)";
}
