import { EMAIL_CLAIM_STALE_MINUTES, EMAIL_MAX_AGE_HOURS, ENRICHMENT_MAX_AGE_DAYS } from '@/lib/config/app';

/** Stop starting new retries after this long; the function limit is 60 s and the rest is retried on the next run. */
export const MAINTENANCE_BUDGET_MS = 50_000;
/** A lead still `pending` after this long means the post-response work and the daily job both missed it. */
export const BACKLOG_PENDING_HOURS = 24;

export type MaintenanceCutoffs = {
  /** Leads created before this are too old for a confirmation mail. */
  emailSince: string;
  /** A `sending` claim older than this is a crashed worker. */
  staleClaimBefore: string;
  /** Leads created before this are no longer enriched. */
  enrichSince: string;
  /** `pending` leads created before this count as backlog on the health page. */
  pendingBefore: string;
};

export function maintenanceCutoffs(now: Date): MaintenanceCutoffs {
  const t = now.getTime();
  return {
    emailSince: new Date(t - EMAIL_MAX_AGE_HOURS * 3_600_000).toISOString(),
    staleClaimBefore: new Date(t - EMAIL_CLAIM_STALE_MINUTES * 60_000).toISOString(),
    enrichSince: new Date(t - ENRICHMENT_MAX_AGE_DAYS * 86_400_000).toISOString(),
    pendingBefore: new Date(t - BACKLOG_PENDING_HOURS * 3_600_000).toISOString(),
  };
}

/** PostgREST `or` filter: retryable mails = pending, failed, or a stale `sending` claim. */
export function emailRetryFilter(staleClaimBefore: string): string {
  return `email_status.in.(pending,failed),and(email_status.eq.sending,email_claimed_at.lt.${staleClaimBefore})`;
}

export function hasTimeBudget(startedAtMs: number, nowMs: number, budgetMs: number = MAINTENANCE_BUDGET_MS): boolean {
  return nowMs - startedAtMs < budgetMs;
}

export type MaintenanceSummary = { leads: number; emailsRetried: number; enrichmentsRetried: number; expired: number };

export function buildSummary(s: {
  leads: number | null;
  emailsRetried: number;
  enrichmentsRetried: number;
  expired: number | null | undefined;
}): MaintenanceSummary {
  return { leads: s.leads ?? 0, emailsRetried: s.emailsRetried, enrichmentsRetried: s.enrichmentsRetried, expired: s.expired ?? 0 };
}

/** Counts only, never lead data: the health endpoint is public. */
export type HealthBacklog = { emailFailed: number; emailStaleSending: number; enrichmentFailed: number; pendingOlderThan24h: number };

export function buildBacklog(c: {
  emailFailed: number | null;
  emailStaleSending: number | null;
  enrichmentFailed: number | null;
  pendingOlderThan24h: number | null;
}): HealthBacklog {
  return {
    emailFailed: c.emailFailed ?? 0,
    emailStaleSending: c.emailStaleSending ?? 0,
    enrichmentFailed: c.enrichmentFailed ?? 0,
    pendingOlderThan24h: c.pendingOlderThan24h ?? 0,
  };
}
