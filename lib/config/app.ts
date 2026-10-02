export const PRIVACY_NOTICE_VERSION = '2026-09-v1';
export const MIN_FILL_MS = 3000;
export const DUPLICATE_WINDOW_DAYS = 90;
export const MAX_EMAIL_ATTEMPTS = 3;
export const EMAIL_CLAIM_STALE_MINUTES = 10;
export const MAX_ENRICHMENT_ATTEMPTS = 3;
export const EMAIL_MAX_AGE_HOURS = 24;
export const ENRICHMENT_MAX_AGE_DAYS = 7;

const RESERVED_DOMAINS = ['example.com', 'example.net', 'example.org'];
const RESERVED_TLDS = ['example', 'test', 'invalid', 'localhost'];

export function emailDomain(email: string): string {
  return email.slice(email.lastIndexOf('@') + 1).trim().toLowerCase();
}

/** RFC 2606/6761 names: never send mail there (reviewers will type fake addresses). */
export function isReservedEmailDomain(email: string): boolean {
  const domain = emailDomain(email);
  if (RESERVED_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`))) return true;
  const tld = domain.split('.').pop() ?? '';
  return RESERVED_TLDS.includes(tld);
}
