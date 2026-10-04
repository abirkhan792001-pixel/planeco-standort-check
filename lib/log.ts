/**
 * What may be logged from an error: its code and message. Never the whole object, because Postgres `details`
 * (and some client errors) carry the failing row, i.e. lead data.
 */
export function errInfo(err: unknown): { code: string | undefined; message: string } {
  const e = err as { code?: unknown; message?: unknown } | null;
  return {
    code: typeof e?.code === 'string' ? e.code : undefined,
    message: typeof e?.message === 'string' ? e.message : String(err),
  };
}
