/**
 * Normalizing tool arguments before anything looks them up.
 *
 * An MCP client that clears a text field sends `""`, not an absent key — MCP
 * Inspector does exactly this, and it is the shape a model produces too when
 * it fills a template it has no value for. An empty string is the caller
 * saying "not set"; treating it as a value turns a blank field into a lookup
 * for nothing.
 *
 * Reported 2026-08-19: typing an agent name into `get_findings`, then
 * clearing it, answered `Agent "" not found. Call list_agents to see the
 * available agents.` — wrong (the field was blank, so every agent was meant)
 * and useless as advice.
 */
import { ToolError } from './errors.js';

/** `""` / whitespace → `undefined`, i.e. the argument was not supplied. */
export function optionalArg(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * A required argument that arrived blank. Fails before any request with a
 * message naming the field, rather than letting `""` reach a path segment
 * (`/pulls//reviews`) or a name lookup and surfacing as a 404.
 */
export function requiredArg(name: string, value: string, hint: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new ToolError(`${name} is empty — nothing was supplied. ${hint}`);
  return trimmed;
}
