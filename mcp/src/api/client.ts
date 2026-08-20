import type { ApiErrorBody } from './types.js';
import { ApiUnreachableError, ApiStatusError, ConfigError } from '../errors.js';

/**
 * Per-request timeout. Each HTTP request gets its own budget — this is
 * intentionally NOT the same thing as a tool's overall `timeout_s`, which
 * bounds only the polling wait in `run_agent_on_pr` (§2c, D4).
 */
export const REQUEST_TIMEOUT_MS = 60_000;

type HttpMethod = 'GET' | 'POST';

/**
 * A thin HTTP client over the DevDigest REST API. Owns transport, timeouts,
 * and status-code-to-error mapping only — no business logic, no retries, no
 * credentials (the API resolves the default workspace via
 * `LocalNoAuthProvider`; this client sends none).
 *
 * Responses are NOT re-validated with Zod (D1): the return type is a
 * type-only cast to the DTO shapes in `./types.js`.
 */
export class DevDigestApi {
  /**
   * Stores the URL string only — performs no I/O.
   *
   * `configError` (from `loadConfig`) is how a malformed environment reaches
   * the caller: rather than crashing at boot, the server starts, lists its
   * tools, and answers every call with that message. Passing it here rather
   * than checking it in each of the five handlers keeps the check on the one
   * path they all share.
   */
  constructor(
    private readonly apiUrl: string,
    private readonly configError?: string,
  ) {}

  async get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  private async request<T>(method: HttpMethod, path: string, body?: unknown): Promise<T> {
    if (this.configError) throw new ConfigError(this.configError);

    let response: Response;
    try {
      response = await fetch(`${this.apiUrl}${path}`, {
        method,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        ...(body !== undefined
          ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
          : {}),
      });
    } catch {
      throw new ApiUnreachableError(
        `Cannot reach the DevDigest API at ${this.apiUrl}. Start it with ./scripts/dev.sh, then retry.`,
      );
    }

    if (response.ok) {
      return (await response.json()) as T;
    }

    throw await this.toApiStatusError(method, path, response);
  }

  private async toApiStatusError(method: HttpMethod, path: string, response: Response): Promise<ApiStatusError> {
    let error: ApiErrorBody['error'] | undefined;
    try {
      const parsed = (await response.json()) as ApiErrorBody;
      error = parsed.error;
    } catch {
      error = undefined;
    }
    return new ApiStatusError(this.mapStatus(method, path, response.status, error), response.status);
  }

  /** Maps a non-ok status to a forward-leading message, per §2c's API table. */
  private mapStatus(
    method: HttpMethod,
    path: string,
    status: number,
    error: { code: string; message: string } | undefined,
  ): string {
    if (status === 429) {
      if (method === 'POST' && /^\/pulls\/[^/]+\/review$/.test(path)) {
        return 'DevDigest rate-limited this request (max 10 review runs per minute). Wait a minute and retry.';
      }
      return 'DevDigest rate-limited this request. Wait a minute and retry.';
    }
    if (status === 404) {
      const base = error?.message ?? 'Resource not found.';
      return `${base} (404). It may have been deleted — re-resolve the repo, PR, or agent and retry.`;
    }
    if (status === 422) {
      const base = error?.message ?? 'The request was rejected as invalid (422).';
      return `${base} This indicates a bug in the MCP server's request, not in your input — please report it.`;
    }
    if (status === 500) {
      const base = error?.message ?? 'The DevDigest API failed with an internal error (500).';
      if (method === 'GET' && /^\/pulls\/[^/]+\/reviews$/.test(path)) {
        return `${base} This endpoint can 500 when a finding's category isn't one of the recognized values (a known data issue, not a bug in your request).`;
      }
      return base;
    }
    return error?.message ?? `The DevDigest API request failed with status ${status}.`;
  }
}
