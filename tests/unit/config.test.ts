import { describe, it, expect } from 'vitest';
import { isReservedEmailDomain } from '@/lib/config/app';

describe('isReservedEmailDomain', () => {
  it.each(['a@example.com', 'a@mail.example.org', 'a@foo.test', 'a@x.invalid', 'a@shop.example', 'a@host.localhost'])(
    '%s is reserved', (e) => expect(isReservedEmailDomain(e)).toBe(true));
  it.each(['a@gmail.com', 'a@gmx.de', 'a@web.de'])('%s is real', (e) => expect(isReservedEmailDomain(e)).toBe(false));
});
