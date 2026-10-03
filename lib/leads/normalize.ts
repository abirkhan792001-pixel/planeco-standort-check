import { parsePhoneNumberFromString } from 'libphonenumber-js';

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Full-width (U+FF10-FF19), Arabic-Indic (U+0660-0669) and Eastern Arabic-Indic (U+06F0-06F9) digits to ASCII 0-9. */
export function toAsciiDigits(s: string): string {
  return s.replace(/[０-９٠-٩۰-۹]/g, (ch) => {
    const code = ch.charCodeAt(0);
    return String(code >= 0xff10 ? code - 0xff10 : code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
  });
}

export type NormalizedPhone = { e164: string | null; valid: boolean; extension: string | null };
const NO_PHONE: NormalizedPhone = { e164: null, valid: false, extension: null };

/**
 * Lenient on input, strict on output. Keeps digits and a leading "+", turns a leading "00" into "+",
 * then parses with default country DE. `valid` is libphonenumber's opinion and is stored as a flag only.
 * An extension is split off first (spec P-5): an explicit marker (ext., x, Durchwahl, DW) plus 1-6 digits at the end,
 * or, only when the input has exactly one hyphen and at least 5 digits sit right before it, a trailing "-12" group of
 * 1-4 digits. Input without a single non-zero digit ("0000000") has no number (P-7).
 */
export function normalizePhone(raw: string): NormalizedPhone {
  let s = toAsciiDigits(raw).trim();
  let extension: string | null = null;

  const marked = s.match(/(?<=\d)\s*(?:ext\.?|x|durchwahl|dw\.?)\s*(\d+)\s*$/i);
  if (marked) {
    // A longer group is no extension, but it is still not part of the number.
    s = s.slice(0, marked.index);
    if (marked[1].length <= 6) extension = marked[1];
  } else if (s.split('-').length === 2) {
    const hyphen = s.match(/(\d+)\s*-\s*(\d{1,4})\s*$/);
    if (hyphen && hyphen[1].length >= 5) {
      extension = hyphen[2];
      s = s.slice(0, hyphen.index! + hyphen[1].length);
    }
  }

  s = s.replace(/[^\d+]/g, '');
  s = s.replace(/(?!^)\+/g, '');
  if (!/[1-9]/.test(s)) return NO_PHONE;
  if (s.startsWith('00')) s = `+${s.slice(2)}`;
  const digits = s.replace(/\D/g, '');
  if (digits.length < 6 || digits.length > 15) return NO_PHONE;

  const parsed = parsePhoneNumberFromString(s, 'DE');
  if (parsed) return { e164: parsed.number, valid: parsed.isValid(), extension };
  if (s.startsWith('+')) return { e164: s, valid: false, extension };
  if (s.startsWith('0')) return { e164: `+49${s.slice(1)}`, valid: false, extension };
  return NO_PHONE;
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

// Typographic dashes (U+2010 hyphen ... U+2015 horizontal bar, U+2212 minus) are folded to "-" so "14<en dash>16" equals "14-16".
const DASHES = /[‐-―−]/g;

export function normalizeHouseNumber(s: string): string {
  return s.toLowerCase().replace(/\s+/g, '').replace(DASHES, '-');
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
