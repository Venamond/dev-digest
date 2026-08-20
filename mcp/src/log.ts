/**
 * Stdio purity (spec 2026-07-28, `basic/transports/stdio`, R9): the server
 * MAY write UTF-8 strings to stderr for logging, and MUST NOT write anything
 * to stdout that is not a valid MCP message. `stdout` belongs to
 * `StdioServerTransport` — application code never writes to it.
 *
 * Never log a response body, `finding.rationale`/`.suggestion`, `Skill.body`,
 * `convention.evidence_snippet`, or a secret. Log lines carry only: tool
 * name, resolved ids, HTTP status, elapsed ms, poll count.
 */

function writeLine(level: 'info' | 'error', msg: string, data?: Record<string, unknown>): void {
  const line = JSON.stringify({ level, msg, ...data });
  process.stderr.write(line + '\n');
}

export function logInfo(msg: string, data?: Record<string, unknown>): void {
  writeLine('info', msg, data);
}

export function logError(msg: string, data?: Record<string, unknown>): void {
  writeLine('error', msg, data);
}
