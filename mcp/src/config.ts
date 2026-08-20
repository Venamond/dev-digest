/**
 * Runtime configuration for the DevDigest MCP server.
 *
 * Two failures look alike here and are not: a malformed `DEVDIGEST_API_URL`
 * is a **config** error — the shape is wrong, and no retry will ever fix it —
 * while an API that simply is not running is a **runtime state** that
 * `./scripts/dev.sh` fixes a second later. Only the second one is worth
 * discovering on the first tool call; the first is knowable at boot, and
 * `server/src/platform/config.ts` (this repo's other env reader) validates
 * its shape with Zod for exactly that reason.
 *
 * Even so, **this function still never throws.** A stdio server that exits
 * during boot reaches the user as an opaque "server failed to connect" with
 * the reason buried in a log; a `configError` carried into the first tool
 * response keeps all five tools listed and puts the variable, the offending
 * value and the remedy in front of the model instead (design principle 4,
 * "errors lead forward"). `index.ts` passes it to `DevDigestApi`, which
 * refuses every request with it before any `fetch`.
 */
import { z } from 'zod';

export const DEFAULT_API_URL = 'http://localhost:3001';

/**
 * `.mcp.json` ships `"env": { "DEVDIGEST_API_URL": … }`; clearing that entry
 * leaves `""`, and `??` would pass an empty string through as a *value* —
 * the apiUrl becomes `''`, every request fails on a relative URL, and the
 * error message names no URL at all. This is the same rule `args.ts` applies
 * to tool arguments: blank means "not supplied". `server/src/platform/config.ts`
 * preprocesses `''` the same way for `LOG_LEVEL`.
 */
const ApiUrlSchema = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
  z.url({ protocol: /^https?$/ }).default(DEFAULT_API_URL),
);

export interface McpConfig {
  /** Trailing slashes stripped, so `${apiUrl}${path}` never doubles one. */
  apiUrl: string;
  /**
   * Present only when the environment is malformed. Set, `apiUrl` must not
   * be used: every tool call answers with this message instead.
   */
  configError?: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): McpConfig {
  const raw = env.DEVDIGEST_API_URL;
  const parsed = ApiUrlSchema.safeParse(raw);

  if (!parsed.success) {
    return {
      apiUrl: raw?.trim() ?? DEFAULT_API_URL,
      configError:
        `DEVDIGEST_API_URL is set to "${raw}", which is not an http(s) URL, so no DevDigest tool can run. ` +
        `Fix the "env" block in .mcp.json — or remove the variable to fall back to ${DEFAULT_API_URL} — ` +
        `then restart the MCP server.`,
    };
  }

  return { apiUrl: parsed.data.replace(/\/+$/, '') };
}
