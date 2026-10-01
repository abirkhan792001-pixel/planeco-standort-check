import { parsePhoneNumberFromString } from 'libphonenumber-js';

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * Lenient on input, strict on output. Keeps digits and a leading "+", turns a leading "00" into "+",
 * then parses with default country DE. `valid` is libphonenumber's opinion and is stored as a flag only.
 */
export function normalizePhone(raw: string): { e164: string | null; valid: boolean } {
  let s = raw.trim();
  // Strip extension markers before processing (ext., x, durchwahl, dw) at the end
  s = s.replace(/(?<=\d)\s*(?:ext\.?|x|durchwahl|dw\.?)\s*\d+\s*$/i, '');
  s = s.replace(/[^\d+]/g, '');
  s = s.replace(/(?!^)\+/g, '');
  if (s.startsWith('00')) s = `+${s.slice(2)}`;
  const digits = s.replace(/\D/g, '');
  if (digits.length < 6 || digits.length > 15) return { e164: null, valid: false };

  const parsed = parsePhoneNumberFromString(s, 'DE');
  if (parsed) return { e164: parsed.number, valid: parsed.isValid() };
  if (s.startsWith('+')) return { e164: s, valid: false };
  if (s.startsWith('0')) return { e164: `+49${s.slice(1)}`, valid: false };
  return { e164: null, valid: false };
}

export function foldGerman(s: string): string {
  return s.normalize('NFC').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
}

/** "Osterstraße" / "Osterstr." / "Oster Straße" → "osterstrasse"; "Strandweg" stays "strandweg". */
export function normalizeStreet(s: string): string {
  return foldGerman(s.trim())
    .replace(/(strasse|str\.?)(?=[^a-z]|$)/g, 'strasse')
    .replace(/[^a-z0-9]/g, '');
}

export function normalizeHouseNumber(s: string): string {
  return s.toLowerCase().replace(/\s+/g, '');
}

export function normalizePlace(s: string): string {
  return foldGerman(s.trim()).replace(/[^a-z0-9]/g, '');
}

export function buildAddressKey(a: {
  street?: string | null;
  houseNumber?: string | null;
  postalCode?: string | null;
  addressUnknown: boolean;
}): string | null {
  if (a.addressUnknown) return null;
  const street = a.street ? normalizeStreet(a.street) : '';
  const postal = (a.postalCode ?? '').trim();
  if (!street || !/^\d{5}$/.test(postal)) return null;
  return `${street}|${normalizeHouseNumber(a.houseNumber ?? '')}|${postal}`;
}
