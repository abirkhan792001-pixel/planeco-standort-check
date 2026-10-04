import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('server-only', () => ({}));
const sendTransactional = vi.fn();
vi.mock('@/lib/email/brevo', () => ({ sendTransactional: (...a: unknown[]) => sendTransactional(...a) }));
const lookupPostalCode = vi.fn();
vi.mock('@/lib/enrichment/openplz', () => ({ lookupPostalCode: (...a: unknown[]) => lookupPostalCode(...a), toLocalitySummary: (l: unknown) => l }));

import { errInfo } from '@/lib/log';
import { logEvent } from '@/lib/leads/events';
import { sendFallbackMail } from '@/lib/email/fallback';
import { GET as plzLookup } from '@/app/api/plz/[plz]/route';
import { leadPayloadSchema } from '@/lib/leads/schema';
import { validPayload } from '../fixtures/payload';

// Postgres puts the failing row into `details`; that is lead data and must never reach the logs.
const pgError = { code: '23514', message: 'violates check constraint', details: 'Failing row contains (Thomas, thomas@gmx.de)', hint: null };

afterEach(() => vi.restoreAllMocks());

describe('errInfo', () => {
  it('keeps code and message only', () => expect(errInfo(pgError)).toEqual({ code: '23514', message: 'violates check constraint' }));
  it('Error without code', () => expect(errInfo(new Error('fetch failed'))).toEqual({ code: undefined, message: 'fetch failed' }));
  it('non-object', () => expect(errInfo('boom')).toEqual({ code: undefined, message: 'boom' }));
  it('null', () => expect(errInfo(null)).toEqual({ code: undefined, message: 'null' }));
});

describe('log hygiene', () => {
  it('logEvent logs code and message, not the row details', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const db = { from: () => ({ insert: async () => ({ error: pgError }) }) } as unknown as SupabaseClient;
    await logEvent(db, 'lead-1', 'email_sent', { messageId: 'x' });
    expect(err).toHaveBeenCalledWith('logEvent failed', 'email_sent', { code: '23514', message: 'violates check constraint' });
    expect(JSON.stringify(err.mock.calls)).not.toContain('Failing row');
  });

  it('fallback mail failure logs code and message only', async () => {
    vi.stubEnv('FALLBACK_INBOX', 'inbox@example.org');
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    sendTransactional.mockRejectedValueOnce(Object.assign(new Error('brevo 400'), { code: 'bad_request', body: { to: 'thomas@gmx.de' } }));
    expect(await sendFallbackMail(leadPayloadSchema.parse(validPayload))).toBe(false);
    expect(err).toHaveBeenCalledWith('fallback mail failed', { code: 'bad_request', message: 'brevo 400' });
    expect(JSON.stringify(err.mock.calls)).not.toContain('thomas@gmx.de');
    vi.unstubAllEnvs();
  });

  it('PLZ lookup failure logs code and message only and answers 502', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    lookupPostalCode.mockRejectedValueOnce(Object.assign(new Error('openplz 503'), { code: 'upstream_down', request: { url: 'https://openplzapi.org/de/Localities?postalCode=20095', headers: { cookie: 'secret' } } }));
    const res = await plzLookup(new Request('http://localhost/api/plz/20095'), { params: Promise.resolve({ plz: '20095' }) });
    expect(res.status).toBe(502);
    expect(err).toHaveBeenCalledWith('plz lookup failed', { code: 'upstream_down', message: 'openplz 503' });
    expect(JSON.stringify(err.mock.calls)).not.toContain('secret');
  });
});
