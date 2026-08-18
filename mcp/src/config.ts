/**
 * Runtime configuration for the DevDigest MCP server. Reads the single
 * environment variable this package uses and never throws — a bad URL
 * surfaces as `ApiUnreachableError` on the first tool call, not as a boot
 * crash.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): { apiUrl: string } {
  const raw = env.DEVDIGEST_API_URL ?? 'http://localhost:3001';
  return { apiUrl: raw.replace(/\/+$/, '') };
}
