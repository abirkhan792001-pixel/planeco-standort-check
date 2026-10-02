export const MAX_BODY_BYTES = 16_000;

export type ParsedBody = { ok: true; body: unknown } | { ok: false; status: 400 | 413 };

/** Size check on actual UTF-8 bytes (content-length can be absent/forged, e.g. chunked), then JSON.parse. */
export function parseJsonBody(text: string): ParsedBody {
  if (Buffer.byteLength(text, 'utf8') > MAX_BODY_BYTES) return { ok: false, status: 413 };
  try {
    return { ok: true, body: JSON.parse(text) };
  } catch {
    return { ok: false, status: 400 };
  }
}
