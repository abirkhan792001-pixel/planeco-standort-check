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
});
