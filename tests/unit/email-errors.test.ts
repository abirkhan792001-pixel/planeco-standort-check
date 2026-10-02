import { describe, it, expect } from 'vitest';
import { BrevoError, isPermanentBrevoError, sanitizeDisplayName } from '@/lib/email/errors';

describe('isPermanentBrevoError', () => {
  it.each([400, 401, 404])('treats %i as permanent', (s) => expect(isPermanentBrevoError(new BrevoError(s, 'x'))).toBe(true));
  it.each([429, 500, 503])('treats %i as retryable', (s) => expect(isPermanentBrevoError(new BrevoError(s, 'x'))).toBe(false));
  it('treats plain errors and non-errors as retryable', () => {
    expect(isPermanentBrevoError(new Error('boom'))).toBe(false);
    expect(isPermanentBrevoError('x')).toBe(false);
  });
});

describe('sanitizeDisplayName', () => {
  it('strips CR/LF/control chars and caps length', () => {
    expect(sanitizeDisplayName('Max\r\nBcc: evil@x.de', 'Muster\u0000')).toBe('Max Bcc: evil@x.de Muster');
    expect(sanitizeDisplayName('a'.repeat(150), 'b'.repeat(150))).toBe(`${'a'.repeat(100)} ${'b'.repeat(100)}`);
  });
});
