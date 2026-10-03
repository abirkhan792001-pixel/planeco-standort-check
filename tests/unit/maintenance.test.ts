import { describe, expect, it } from 'vitest';
import { EMAIL_CLAIM_STALE_MINUTES, EMAIL_MAX_AGE_HOURS, ENRICHMENT_MAX_AGE_DAYS } from '@/lib/config/app';
import {
  BACKLOG_PENDING_HOURS, EMAIL_EXPIRY_PATCH, ENRICHMENT_HEADROOM_MS, FUNCTION_LIMIT_MS, MAINTENANCE_BUDGET_MS,
  buildBacklog, buildSummary, canStartEnrichment, countOrNull, emailRetryFilter, hasEnrichmentHeadroom, hasTimeBudget,
  maintenanceCutoffs, summaryStatus,
} from '@/lib/maintenance/windows';

const NOW = new Date('2026-10-03T04:00:00.000Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

describe('maintenanceCutoffs', () => {
  it('derives every threshold from the single clock passed in', () => {
    const c = maintenanceCutoffs(NOW);
    expect(c.emailSince).toBe(hoursAgo(EMAIL_MAX_AGE_HOURS));
    expect(c.staleClaimBefore).toBe(new Date(NOW.getTime() - EMAIL_CLAIM_STALE_MINUTES * 60_000).toISOString());
    expect(c.enrichSince).toBe(hoursAgo(ENRICHMENT_MAX_AGE_DAYS * 24));
    expect(c.pendingBefore).toBe(hoursAgo(BACKLOG_PENDING_HOURS));
  });

  it('is pure: the input date is not mutated and equal inputs give equal outputs', () => {
    const before = NOW.getTime();
    expect(maintenanceCutoffs(NOW)).toEqual(maintenanceCutoffs(new Date(before)));
    expect(NOW.getTime()).toBe(before);
  });

  it('keeps the spec values: 24 h mail window, 7 d enrichment window, 24 h backlog threshold', () => {
    const c = maintenanceCutoffs(NOW);
    expect(c.emailSince).toBe('2026-10-02T04:00:00.000Z');
    expect(c.enrichSince).toBe('2026-09-26T04:00:00.000Z');
    expect(c.pendingBefore).toBe('2026-10-02T04:00:00.000Z');
    expect(c.staleClaimBefore).toBe('2026-10-03T03:50:00.000Z');
  });
});

describe('emailRetryFilter', () => {
  it('selects pending, failed and stale sending claims only', () => {
    expect(emailRetryFilter('2026-10-03T03:50:00.000Z')).toBe(
      'email_status.in.(pending,failed),and(email_status.eq.sending,email_claimed_at.lt.2026-10-03T03:50:00.000Z)',
    );
  });
});

describe('EMAIL_EXPIRY_PATCH', () => {
  it('closes as skipped/too_late and leaves email_last_error and the attempt counter alone', () => {
    expect(EMAIL_EXPIRY_PATCH).toEqual({ email_status: 'skipped', email_skip_reason: 'too_late' });
    expect(Object.keys(EMAIL_EXPIRY_PATCH)).not.toContain('email_last_error');
    expect(Object.keys(EMAIL_EXPIRY_PATCH)).not.toContain('email_attempts');
  });
});

describe('hasTimeBudget', () => {
  it('allows work until the budget is used up', () => {
    expect(hasTimeBudget(1000, 1000)).toBe(true);
    expect(hasTimeBudget(1000, 1000 + MAINTENANCE_BUDGET_MS - 1)).toBe(true);
    expect(hasTimeBudget(1000, 1000 + MAINTENANCE_BUDGET_MS)).toBe(false);
  });

  it('stops starting new jobs after 35 s and honours a custom budget', () => {
    expect(MAINTENANCE_BUDGET_MS).toBe(35_000);
    expect(MAINTENANCE_BUDGET_MS).toBeLessThan(FUNCTION_LIMIT_MS);
    expect(hasTimeBudget(0, 34_999)).toBe(true);
    expect(hasTimeBudget(0, 35_000)).toBe(false);
    expect(hasTimeBudget(0, 99, 100)).toBe(true);
    expect(hasTimeBudget(0, 100, 100)).toBe(false);
  });
});

describe('hasEnrichmentHeadroom', () => {
  it('needs at least 20 s left before the 60 s function limit', () => {
    expect(FUNCTION_LIMIT_MS).toBe(60_000);
    expect(ENRICHMENT_HEADROOM_MS).toBe(20_000);
    expect(hasEnrichmentHeadroom(1_000, 1_000 + 40_000)).toBe(true); // exactly 20 s left
    expect(hasEnrichmentHeadroom(1_000, 1_000 + 40_001)).toBe(false);
  });

  it('honours custom limit and headroom', () => {
    expect(hasEnrichmentHeadroom(0, 70, 100, 30)).toBe(true);
    expect(hasEnrichmentHeadroom(0, 71, 100, 30)).toBe(false);
  });
});

describe('canStartEnrichment', () => {
  it('requires both the job budget and the headroom', () => {
    expect(canStartEnrichment(0, 0)).toBe(true);
    expect(canStartEnrichment(0, 34_999)).toBe(true);
    expect(canStartEnrichment(0, 35_000)).toBe(false); // budget spent, headroom (25 s) would still be fine
    expect(canStartEnrichment(0, 34_000, 30_000, 20_000)).toBe(false); // tight limit: headroom spent while budget is not
    expect(canStartEnrichment(0, 9_999, 30_000, 20_000)).toBe(true);
  });
});

describe('buildSummary', () => {
  it('has exactly the documented shape and defaults missing counts to 0', () => {
    expect(buildSummary({ leads: 42, emailsRetried: 2, enrichmentsRetried: 3, expired: 1 })).toEqual({ leads: 42, emailsRetried: 2, enrichmentsRetried: 3, expired: 1 });
    expect(buildSummary({ leads: null, emailsRetried: 0, enrichmentsRetried: 0, expired: undefined })).toEqual({ leads: 0, emailsRetried: 0, enrichmentsRetried: 0, expired: 0 });
  });

  it('adds `errors` only when something failed', () => {
    const base = { leads: 1, emailsRetried: 0, enrichmentsRetried: 0, expired: 0 };
    expect(buildSummary({ ...base, errors: 0 })).not.toHaveProperty('errors');
    expect(buildSummary({ ...base, errors: undefined })).not.toHaveProperty('errors');
    expect(buildSummary({ ...base, errors: 2 })).toEqual({ ...base, errors: 2 });
  });
});

describe('summaryStatus', () => {
  it('is 500 as soon as any error was counted, so Vercel marks the run failed', () => {
    expect(summaryStatus(buildSummary({ leads: 1, emailsRetried: 0, enrichmentsRetried: 0, expired: 0 }))).toBe(200);
    expect(summaryStatus(buildSummary({ leads: 1, emailsRetried: 0, enrichmentsRetried: 0, expired: 0, errors: 1 }))).toBe(500);
  });
});

describe('countOrNull', () => {
  it('passes a successful count through and turns a failed or missing one into null', () => {
    expect(countOrNull({ count: 7, error: null })).toBe(7);
    expect(countOrNull({ count: 0, error: null })).toBe(0);
    expect(countOrNull({ count: null, error: null })).toBe(0); // answered without a number: nothing counted
    expect(countOrNull({ count: null, error: { message: 'boom' } })).toBeNull();
    expect(countOrNull({ count: 5, error: { message: 'boom' } })).toBeNull();
  });
});

describe('buildBacklog', () => {
  const full = { emailFailed: 1, emailStaleSending: 2, enrichmentFailed: 3, enrichmentGaveUp: 5, pendingOlderThan24h: 4 };

  it('exposes counts only, including the separate enrichmentGaveUp bucket', () => {
    expect(buildBacklog(full)).toEqual(full);
  });

  it('keeps a failed (null) count as null instead of pretending it is 0', () => {
    expect(buildBacklog({ emailFailed: null, emailStaleSending: 0, enrichmentFailed: null, enrichmentGaveUp: 0, pendingOlderThan24h: null }))
      .toEqual({ emailFailed: null, emailStaleSending: 0, enrichmentFailed: null, enrichmentGaveUp: 0, pendingOlderThan24h: null });
  });
});
