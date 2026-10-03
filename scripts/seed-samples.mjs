// Posts the five case samples through the real API (same path as the form). Emails use example.com → marked as test, no mail sent.
// Usage: node scripts/seed-samples.mjs https://<production-url>
// Each sample has a fixed idempotency key, so a re-run replays (200) instead of creating duplicates.
const base = process.argv[2]?.replace(/\/+$/, '');
if (!base) throw new Error('usage: node scripts/seed-samples.mjs <base-url>');

const samples = [
  { key: '5eed0000-0000-4000-8000-000000000001',
    firstName: 'Thomas', lastName: 'Ahrens', phone: '+49 40 / 123 456', street: 'Hauptstraße', houseNumber: '14', postalCode: '01067', city: 'Dresden',
    attribution: { utm_source: 'facebook', utm_medium: 'paid_social', utm_campaign: 'standortcheck_test' } },
  { key: '5eed0000-0000-4000-8000-000000000002',
    firstName: 'Marion', lastName: 'Beckmann', phone: '0170 5551234', addressUnknown: true, plotNote: 'Lindenweg 3, Neustadt',
    attribution: { gclid: 'SEED-GCLID-1' } },
  { key: '5eed0000-0000-4000-8000-000000000003',
    firstName: 'Kai', lastName: 'Ruthenberg', phone: '040 55512345', street: 'Osterstraße', houseNumber: '88', postalCode: '22765', city: 'Hamburg',
    attribution: { utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'standortcheck_brand' } },
  { key: '5eed0000-0000-4000-8000-000000000004',
    firstName: 'Thomas', lastName: 'Ahrens', phone: '004940123456', street: 'Hauptstraße', houseNumber: '14', postalCode: '01067', city: 'Dresden',
    attribution: { fbclid: 'SEED-FBCLID-1' } },
  { key: '5eed0000-0000-4000-8000-000000000005',
    firstName: 'Jörg', lastName: 'Klöpper', phone: '0451 9988776', street: 'Am Mühlenteich', houseNumber: '7', postalCode: '23627', city: 'Groß Grönau',
    attribution: { referrer: 'https://www.google.de/' } },
];

for (const [i, { key, ...s }] of samples.entries()) {
  const body = {
    idempotencyKey: key, fillMs: 60_000, website: '', isTest: true,
    email: `${s.firstName}.${s.lastName}.${i + 1}@example.com`.toLowerCase().replace(/[^a-z0-9.@]/g, ''),
    addressUnknown: false, street: '', houseNumber: '', postalCode: '', city: '', plotNote: '', projectType: null, reachability: [],
    ...s, attribution: { landing_path: '/', ...s.attribution },
  };
  const res = await fetch(`${base}/api/leads`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const ok = res.status === 200 || res.status === 201; // 201 = created, 200 = replay of an earlier run
  if (!ok) process.exitCode = 1;
  console.log(`#${i + 1} ${s.firstName} ${s.lastName}: ${res.status}${ok ? '' : ' (FAILED)'} ${await res.text()}`);
  if (i < samples.length - 1) await new Promise((r) => setTimeout(r, 3000)); // be gentle with Nominatim (enrichment runs after each response)
}
