import { describe, it, expect } from 'vitest';
import { captureAttribution } from '@/lib/attribution/capture';
import { classifyChannel } from '@/lib/attribution/classify';

const OWN = 'planeco-standort-check.vercel.app';

describe('captureAttribution', () => {
  it('reads UTMs and click ids, case-insensitive keys (Heyflow uses GCLID/FBCLID)', () => {
    const r = captureAttribution('?utm_source=Facebook&GCLID=abc&FBCLID=f1&x=1', 'https://www.google.de/', '/');
    expect(r.attribution).toMatchObject({ utm_source: 'Facebook', gclid: 'abc', fbclid: 'f1', landing_path: '/', referrer: 'https://www.google.de/' });
    expect(r.attribution).not.toHaveProperty('x');
    expect(r.isTest).toBe(false);
  });
  it('flags test=1', () => expect(captureAttribution('?test=1', '', '/').isTest).toBe(true));
  it('caps values at 500 chars', () => {
    expect(captureAttribution(`?utm_campaign=${'a'.repeat(600)}`, '', '/').attribution.utm_campaign).toHaveLength(500);
  });
});

describe('classifyChannel', () => {
  it('gclid without UTMs is Google Ads (auto-tagging)', () => {
    expect(classifyChannel({ gclid: 'x' }, OWN)).toEqual({ group: 'Paid Search', channel: 'Google Ads', campaign: '(ohne Kampagne)' });
  });
  it('gbraid/wbraid are Google Ads too', () => {
    expect(classifyChannel({ wbraid: 'x' }, OWN).channel).toBe('Google Ads');
  });
  it('msclkid is Microsoft Ads', () => expect(classifyChannel({ msclkid: 'x' }, OWN).channel).toBe('Microsoft Ads'));
  it('Meta paid is case-insensitive', () => {
    expect(classifyChannel({ utm_source: 'Facebook', utm_medium: 'Paid_Social', utm_campaign: 'hh_test' }, OWN))
      .toEqual({ group: 'Paid Social', channel: 'Meta Ads', campaign: 'hh_test' });
  });
  it('Meta source without paid medium is organic', () => {
    expect(classifyChannel({ utm_source: 'ig', utm_medium: 'social' }, OWN).group).toBe('Organic Social');
  });
  it('fbclid alone is NOT assumed paid', () => {
    expect(classifyChannel({ fbclid: 'x' }, OWN).group).toBe('Social (unklar)');
  });
  it('google + paid medium without click id is Google Ads (manual tagging)', () => {
    expect(classifyChannel({ utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'standortcheck_brand' }, OWN))
      .toEqual({ group: 'Paid Search', channel: 'Google Ads', campaign: 'standortcheck_brand' });
  });
  it('manual search tagging is case-insensitive', () => {
    expect(classifyChannel({ utm_source: 'Google', utm_medium: 'CPC' }, OWN)).toMatchObject({ group: 'Paid Search', channel: 'Google Ads' });
  });
  it('bing + paid medium without click id is Microsoft Ads', () => {
    expect(classifyChannel({ utm_source: 'bing', utm_medium: 'ppc' }, OWN)).toMatchObject({ group: 'Paid Search', channel: 'Microsoft Ads' });
  });
  it('google without a paid medium is not Paid Search', () => {
    expect(classifyChannel({ utm_source: 'google', utm_medium: 'organic' }, OWN).group).toBe('Campaign');
  });
  it('other paid mediums', () => {
    expect(classifyChannel({ utm_source: 'linkedin', utm_medium: 'cpc' }, OWN)).toMatchObject({ group: 'Paid Other', channel: 'Paid – linkedin' });
  });
  it('email campaigns', () => expect(classifyChannel({ utm_source: 'newsletter', utm_medium: 'email' }, OWN).group).toBe('Email'));
  it('any other UTM is a campaign', () => expect(classifyChannel({ utm_source: 'flyer' }, OWN)).toMatchObject({ group: 'Campaign', channel: 'flyer' }));
  it('search referrer is organic search', () => {
    expect(classifyChannel({ referrer: 'https://www.google.de/' }, OWN)).toMatchObject({ group: 'Organic Search', channel: 'google.de' });
  });
  it('social referrer is organic social', () => {
    expect(classifyChannel({ referrer: 'https://lm.facebook.com/l.php' }, OWN).group).toBe('Organic Social');
  });
  it('external referrer is referral', () => {
    expect(classifyChannel({ referrer: 'https://www.bauforum.de/thread' }, OWN)).toMatchObject({ group: 'Referral', channel: 'bauforum.de' });
  });
  it('own host or nothing is direct', () => {
    expect(classifyChannel({ referrer: `https://${OWN}/datenschutz` }, OWN).group).toBe('Direkt/Unbekannt');
    expect(classifyChannel({}, OWN).group).toBe('Direkt/Unbekannt');
  });
});
