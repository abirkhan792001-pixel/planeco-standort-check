import { describe, it, expect } from 'vitest';
import { leadPayloadSchema, fieldErrors } from '@/lib/leads/schema';
import { validPayload } from '../fixtures/payload';

describe('leadPayloadSchema', () => {
  it('accepts a valid payload', () => expect(leadPayloadSchema.safeParse(validPayload).success).toBe(true));

  it('requires street/PLZ/city unless the address is unknown', () => {
    const r = leadPayloadSchema.safeParse({ ...validPayload, street: '', postalCode: '123', city: '' });
    expect(r.success).toBe(false);
    if (!r.success) expect(Object.keys(fieldErrors(r.error)).sort()).toEqual(['city', 'postalCode', 'street']);
  });

  it('address unknown needs a location description instead', () => {
    const base = { ...validPayload, addressUnknown: true, street: '', postalCode: '', city: '' };
    expect(leadPayloadSchema.safeParse({ ...base, plotNote: 'x' }).success).toBe(false);
    expect(leadPayloadSchema.safeParse({ ...base, plotNote: 'Lindenweg 3, Neustadt' }).success).toBe(true);
  });

  it('phone needs 6–15 digits but any formatting', () => {
    expect(leadPayloadSchema.safeParse({ ...validPayload, phone: '12345' }).success).toBe(false);
    expect(leadPayloadSchema.safeParse({ ...validPayload, phone: '(040) 55-51-23-45' }).success).toBe(true);
  });

  it('rejects an invalid email', () => expect(leadPayloadSchema.safeParse({ ...validPayload, email: 'nope' }).success).toBe(false));

  it('rejects overlong names', () => expect(leadPayloadSchema.safeParse({ ...validPayload, firstName: 'x'.repeat(101) }).success).toBe(false));

  it('counts plotNote length in code points like Postgres char_length', () => {
    const base = { ...validPayload, addressUnknown: true, street: '', postalCode: '', city: '' };
    const bad = leadPayloadSchema.safeParse({ ...base, plotNote: '\u{1F600}a' });
    expect(bad.success).toBe(false);
    if (!bad.success) expect(Object.keys(fieldErrors(bad.error))).toContain('plotNote');
    expect(leadPayloadSchema.safeParse({ ...base, plotNote: '\u{1F600}ab' }).success).toBe(true);
  });

  it('rejects NUL characters in free-text fields', () => {
    const r = leadPayloadSchema.safeParse({ ...validPayload, firstName: 'Tho\u0000mas' });
    expect(r.success).toBe(false);
    if (!r.success) expect(fieldErrors(r.error).firstName).toBe('Ungültige Zeichen');
    for (const k of ['lastName', 'email', 'phone', 'street', 'houseNumber', 'city']) {
      const v = k === 'email' ? 'a\u0000@example.com' : k === 'phone' ? '+49 40 123 456\u0000' : 'a\u0000b';
      expect(leadPayloadSchema.safeParse({ ...validPayload, [k]: v }).success).toBe(false);
    }
  });

  it('strips NULs from website and attribution values', () => {
    const r = leadPayloadSchema.parse({ ...validPayload, website: 'a\u0000b', attribution: { utm_source: 'fa\u0000ce' } });
    expect(r.website).toBe('ab');
    expect((r.attribution as Record<string, unknown>).utm_source).toBe('face');
  });

  it('requires fillMs and bounds it', () => {
    const rest: Record<string, unknown> = { ...validPayload };
    delete rest.fillMs;
    expect(leadPayloadSchema.safeParse(rest).success).toBe(false);
    expect(leadPayloadSchema.safeParse({ ...validPayload, fillMs: -1 }).success).toBe(false);
  });
});
