import { describe, it, expect } from 'vitest';
import { EnrichmentConfigError, EnrichmentHttpError, enrichmentErrorCode } from '@/lib/enrichment/errors';

describe('enrichmentErrorCode (A-9)', () => {
  it('HTTP 429 from Nominatim or OpenPLZ is "rate_limited"', () => {
    expect(enrichmentErrorCode(new EnrichmentHttpError('nominatim', 429))).toBe('rate_limited');
    expect(enrichmentErrorCode(new EnrichmentHttpError('openplz', 429))).toBe('rate_limited');
  });
  it('other HTTP errors keep their message', () => {
    expect(enrichmentErrorCode(new EnrichmentHttpError('nominatim', 503))).toBe('nominatim 503');
    expect(enrichmentErrorCode(new EnrichmentHttpError('openplz', 500))).toBe('openplz 500');
  });
  it('TimeoutError and AbortError are "timeout"', () => {
    expect(enrichmentErrorCode(new DOMException('The operation timed out.', 'TimeoutError'))).toBe('timeout');
    expect(enrichmentErrorCode(new DOMException('This operation was aborted', 'AbortError'))).toBe('timeout');
    const named = new Error('slow');
    named.name = 'TimeoutError';
    expect(enrichmentErrorCode(named)).toBe('timeout');
  });
  it('a real AbortSignal.timeout() rejection is "timeout" (no network involved)', async () => {
    const signal = AbortSignal.timeout(5);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(signal.aborted).toBe(true);
    expect(enrichmentErrorCode(signal.reason)).toBe('timeout');
  });
  it('a missing config value reports its own code', () => {
    expect(enrichmentErrorCode(new EnrichmentConfigError('config_missing_contact'))).toBe('config_missing_contact');
  });
  it('other errors keep their message, truncated to 500 characters', () => {
    expect(enrichmentErrorCode(new Error('boom'))).toBe('boom');
    expect(enrichmentErrorCode(new Error('x'.repeat(900)))).toHaveLength(500);
  });
  it('handles non-Error values (Supabase error objects, strings, null)', () => {
    expect(enrichmentErrorCode({ code: '23505', message: 'duplicate key' })).toBe('duplicate key');
    expect(enrichmentErrorCode('plain string')).toBe('plain string');
    expect(enrichmentErrorCode(null)).toBe('unknown');
    expect(enrichmentErrorCode(undefined)).toBe('unknown');
    expect(enrichmentErrorCode(42)).toBe('unknown');
    expect(enrichmentErrorCode(new Error(''))).toBe('unknown');
  });
});
