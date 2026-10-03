import { EMAIL_CLAIM_STALE_MINUTES, EMAIL_MAX_AGE_HOURS, ENRICHMENT_MAX_AGE_DAYS } from '@/lib/config/app';

/** Vercel `maxDuration` of the cron route (the route file must keep its own literal `maxDuration = 60`). */
export const FUNCTION_LIMIT_MS = 60_000;
/** Stop starting new retries after this long; the rest is retried on the next run. */
export const MAINTENANCE_BUDGET_MS = 35_000;
/** Worst case of one enrichment (OpenPLZ + Nominatim with spacing, 6 s timeouts): do not start one with less time left. */
export const ENRICHMENT_HEADROOM_MS = 20_000;
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

/**
 * Update patch for confirmations that are past EMAIL_MAX_AGE_HOURS (spec E-4 / section 20: after 24 h the mail is
 * skipped as too_late). `email_last_error` is deliberately not part of the patch so the last failure stays visible.
 */
export const EMAIL_EXPIRY_PATCH = { email_status: 'skipped', email_skip_reason: 'too_late' } as const;

/** True while new jobs may still be started. */
export function hasTimeBudget(startedAtMs: number, nowMs: number, budgetMs: number = MAINTENANCE_BUDGET_MS): boolean {
  return nowMs - startedAtMs < budgetMs;
}

/** True while at least `headroomMs` remain before the function limit. */
export function hasEnrichmentHeadroom(
  startedAtMs: number,
  nowMs: number,
  limitMs: number = FUNCTION_LIMIT_MS,
  headroomMs: number = ENRICHMENT_HEADROOM_MS,
): boolean {
  return limitMs - (nowMs - startedAtMs) >= headroomMs;
}

/** An enrichment is the slowest job: it needs the job budget and the headroom. */
export function canStartEnrichment(
  startedAtMs: number,
  nowMs: number,
  limitMs: number = FUNCTION_LIMIT_MS,
  headroomMs: number = ENRICHMENT_HEADROOM_MS,
): boolean {
  return hasTimeBudget(startedAtMs, nowMs) && hasEnrichmentHeadroom(startedAtMs, nowMs, limitMs, headroomMs);
}

export type MaintenanceSummary = {
  leads: number;
  emailsRetried: number;
  enrichmentsRetried: number;
  expired: number;
  /** Present only when a query or job failed. */
  errors?: number;
};

export function buildSummary(s: {
  leads: number | null;
  emailsRetried: number;
  enrichmentsRetried: number;
  expired: number | null | undefined;
  errors?: number;
}): MaintenanceSummary {
  return {
    leads: s.leads ?? 0,
    emailsRetried: s.emailsRetried,
    enrichmentsRetried: s.enrichmentsRetried,
    expired: s.expired ?? 0,
    ...(s.errors ? { errors: s.errors } : {}),
  };
}

/** Any error makes the cron answer 500 (after doing what it could), so Vercel marks the run as failed. */
export function summaryStatus(summary: MaintenanceSummary): 200 | 500 {
  return summary.errors ? 500 : 200;
}

/** A head-count result: the number when the query worked, `null` when it failed. */
export function countOrNull(r: { count: number | null; error: unknown }): number | null {
  return r.error ? null : (r.count ?? 0);
}

/** Counts only, never lead data: the health endpoint is public. `null` = that count could not be read. */
export type HealthBacklog = {
  emailFailed: number | null;
  emailStaleSending: number | null;
  /** Failed enrichments that are still retried (younger than ENRICHMENT_MAX_AGE_DAYS). */
  enrichmentFailed: number | null;
  /** Failed enrichments older than ENRICHMENT_MAX_AGE_DAYS: no longer retried. */
  enrichmentGaveUp: number | null;
  pendingOlderThan24h: number | null;
};

export function buildBacklog(c: HealthBacklog): HealthBacklog {
  return {
    emailFailed: c.emailFailed,
    emailStaleSending: c.emailStaleSending,
    enrichmentFailed: c.enrichmentFailed,
    enrichmentGaveUp: c.enrichmentGaveUp,
    pendingOlderThan24h: c.pendingOlderThan24h,
  };
}
