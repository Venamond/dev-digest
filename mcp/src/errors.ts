/**
 * Every error `mcp/` throws names the next concrete action the calling model
 * should take — never a bare failure. This is design principle 4, "errors
 * lead forward" (see docs/plans/2026-08-18-mcp-server.md §2c; D15 there is
 * where the principle was first argued, and was RETIRED in L04 when
 * `get_blast_radius` stopped being a stub — the principle outlived it).
 *
 * `ToolError` is the base class every tool handler is expected to catch and
 * turn into `errorContent(err.message)` (see `format.ts`, S3/S4).
 * `ApiUnreachableError` and `ApiStatusError` are the two flavours the HTTP
 * client (`api/client.ts`) can throw; the resolvers (`api/resolve.ts`) throw
 * plain `ToolError` for lookup failures that have nothing to do with
 * transport.
 */

export class ToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolError';
  }
}

/** The DevDigest API could not be reached at all — `fetch` rejected. */
export class ApiUnreachableError extends ToolError {
  constructor(message: string) {
    super(message);
    this.name = 'ApiUnreachableError';
  }
}

/** The DevDigest API responded, but with a non-2xx status. */
export class ApiStatusError extends ToolError {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiStatusError';
    this.status = status;
  }
}
