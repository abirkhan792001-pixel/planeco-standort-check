import { describe, expect, it } from 'vitest';
import { EMAIL_CLAIM_STALE_MINUTES, EMAIL_MAX_AGE_HOURS, ENRICHMENT_MAX_AGE_DAYS } from '@/lib/config/app';
import {
  BACKLOG_PENDING_HOURS, MAINTENANCE_BUDGET_MS, buildBacklog, buildSummary, emailRetryFilter, hasTimeBudget, maintenanceCutoffs,
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

describe('hasTimeBudget', () => {
  it('allows work until the budget is used up', () => {
    expect(hasTimeBudget(1000, 1000)).toBe(true);
    expect(hasTimeBudget(1000, 1000 + MAINTENANCE_BUDGET_MS - 1)).toBe(true);
    expect(hasTimeBudget(1000, 1000 + MAINTENANCE_BUDGET_MS)).toBe(false);
  });

  it('stays below the 60 s function limit and honours a custom budget', () => {
    expect(MAINTENANCE_BUDGET_MS).toBeLessThan(60_000);
    expect(hasTimeBudget(0, 99, 100)).toBe(true);
    expect(hasTimeBudget(0, 100, 100)).toBe(false);
  });
});

describe('buildSummary', () => {
  it('has exactly the documented shape and defaults missing counts to 0', () => {
    expect(buildSummary({ leads: 42, emailsRetried: 2, enrichmentsRetried: 3, expired: 1 })).toEqual({ leads: 42, emailsRetried: 2, enrichmentsRetried: 3, expired: 1 });
    expect(buildSummary({ leads: null, emailsRetried: 0, enrichmentsRetried: 0, expired: undefined })).toEqual({ leads: 0, emailsRetried: 0, enrichmentsRetried: 0, expired: 0 });
  });
});

describe('buildBacklog', () => {
  it('exposes counts only, with null counts as 0', () => {
    expect(buildBacklog({ emailFailed: 1, emailStaleSending: 2, enrichmentFailed: 3, pendingOlderThan24h: 4 }))
      .toEqual({ emailFailed: 1, emailStaleSending: 2, enrichmentFailed: 3, pendingOlderThan24h: 4 });
    expect(buildBacklog({ emailFailed: null, emailStaleSending: null, enrichmentFailed: null, pendingOlderThan24h: null }))
      .toEqual({ emailFailed: 0, emailStaleSending: 0, enrichmentFailed: 0, pendingOlderThan24h: 0 });
  });
});
