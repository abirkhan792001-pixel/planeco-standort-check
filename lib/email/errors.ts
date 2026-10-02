export class BrevoError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'BrevoError';
    this.status = status;
  }
}

/** 4xx (except 429 rate limit) will never succeed on retry. */
export function isPermanentBrevoError(err: unknown): boolean {
  return err instanceof BrevoError && err.status >= 400 && err.status < 500 && err.status !== 429;
}

const CONTROL = /[\u0000-\u001f\u007f]+/g;
const clean = (s: string) => s.replace(CONTROL, ' ').trim().slice(0, 100);

/** Header-injection-safe display name for the Brevo `to.name`. */
export function sanitizeDisplayName(first: string, last: string): string {
  return `${clean(first)} ${clean(last)}`.trim();
}
