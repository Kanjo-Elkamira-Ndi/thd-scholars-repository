/**
 * A typed error for every failed API interaction.
 *
 * `status: 0` / `code: 'NETWORK_ERROR'` means the request never reached the API
 * (offline, DNS, CORS, abort). Anything else is the API's own
 * `{ error: { code, message, details? } }` envelope, surfaced verbatim.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
