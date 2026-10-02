// No 'server-only' import on purpose: this module is pure and unit-tested.

/** A non-2xx answer from Nominatim or OpenPLZ. Message stays "<service> <status>" so unclassified codes read as before. */
export class EnrichmentHttpError extends Error {
  readonly service: 'nominatim' | 'openplz';
  readonly status: number;
  constructor(service: 'nominatim' | 'openplz', status: number) {
    super(`${service} ${status}`);
    this.name = 'EnrichmentHttpError';
    this.service = service;
    this.status = status;
  }
}

/** A required setting is missing; `code` is stored verbatim as `enrichment_last_error`. */
export class EnrichmentConfigError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = 'EnrichmentConfigError';
    this.code = code;
  }
}

const MAX_ERROR_LENGTH = 500;

/**
 * Pure. Maps a thrown value to the string stored in `enrichment_last_error` (spec A-9):
 * HTTP 429 → 'rate_limited', timeouts/aborts → 'timeout', config problems → their own code,
 * anything else → its message, truncated.
 */
export function enrichmentErrorCode(err: unknown): string {
  if (err instanceof EnrichmentConfigError) return err.code;
  if (err instanceof EnrichmentHttpError && err.status === 429) return 'rate_limited';
  const name = (err as { name?: unknown } | null)?.name;
  if (name === 'TimeoutError' || name === 'AbortError') return 'timeout';
  const message = typeof err === 'string' ? err : (err as { message?: unknown } | null)?.message;
  return typeof message === 'string' && message.length > 0 ? message.slice(0, MAX_ERROR_LENGTH) : 'unknown';
}
