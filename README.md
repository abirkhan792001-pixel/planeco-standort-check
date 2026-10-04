# Standort-Check — lead funnel prototype

Case study for Planeco Building (Tech & Automation). A free "site check" offer: mobile form → Supabase → confirmation email → sales dashboard with atomic claiming, XLSX export, channel report and address enrichment. Runs entirely on free tiers. UI in German, docs in English.

**Live:** https://planeco-standort-check.vercel.app · **Dashboard:** https://planeco-standort-check.vercel.app/dashboard (logins in the submission email) · **Notes:** [NOTES.md](NOTES.md) · **Details:** [DECISIONS.md](DECISIONS.md)

## Try it
- Plain form: [`/`](https://planeco-standort-check.vercel.app/)
- Meta paid: [`/?utm_source=facebook&utm_medium=paid_social&utm_campaign=standortcheck_test`](https://planeco-standort-check.vercel.app/?utm_source=facebook&utm_medium=paid_social&utm_campaign=standortcheck_test)
- Google Ads auto-tagging (no UTMs): [`/?gclid=TEST-GCLID-123`](https://planeco-standort-check.vercel.app/?gclid=TEST-GCLID-123)
- Google manual tagging: [`/?utm_source=google&utm_medium=cpc&utm_campaign=standortcheck_brand`](https://planeco-standort-check.vercel.app/?utm_source=google&utm_medium=cpc&utm_campaign=standortcheck_brand)
- Facebook click without UTMs (paid or organic is unknowable): [`/?fbclid=TEST-ORGANIC`](https://planeco-standort-check.vercel.app/?fbclid=TEST-ORGANIC)
- Mark a submission as test data: [`/?test=1`](https://planeco-standort-check.vercel.app/?test=1)

Emails at `example.com/.net/.org`, `test.de` and the `.test`/`.example`/`.invalid` TLDs are stored as test leads but never mailed (protects the sender reputation). Real addresses get one confirmation per 24 h at most.

The five case samples are seeded as test data. Dashboard view of the seeded samples (verified on production, see [Tested on](#tested-on)):

| # | Sample | Dashboard |
|---|---|---|
| 1 | Thomas Ahrens, Hauptstraße 14, 01067 Dresden | Außerhalb · Berlin ~164 km · Hausgenau, but "PLZ passt nicht zur Straße (gefunden: 01097)" · Paid Social / Meta Ads |
| 2 | Marion Beckmann, "Adresse unbekannt": Lindenweg 3, Neustadt | Unklar · Mehrdeutig (candidates in three federal states) · Paid Search / Google Ads |
| 3 | Kai Ruthenberg, Osterstraße 88, 22765 Hamburg | Im Gebiet · Hamburg · Straßengenau (house number not in OSM, PLZ mismatch) · Paid Search / Google Ads (manual UTM tagging, no gclid) |
| 4 | Thomas Ahrens again, phone `004940123456` | Duplicate of #1 (phone + address): hidden in the default view, #1 shows "2 Anfragen"; visible with "Alle Einzelanfragen" |
| 5 | Jörg Klöpper, Am Mühlenteich 7, 23627 Groß Grönau | Randlage · Hamburg ~55 km · Nur PLZ-genau (street not in OSM) · Organic Search (google.de) |

The report (`/dashboard/report`) excludes test data by default; "Testdaten einbeziehen" shows the seeded channels.

## Architecture
```
Ad click ─▶ / (form) ─POST /api/leads─▶ validate → spam check → normalize → dedupe → INSERT (Supabase, Frankfurt)
                │                       └─ after(): confirmation mail (Brevo) → enrichment (OpenPLZ + Nominatim)
                └─ GET /api/plz/{plz} (OpenPLZ proxy, CDN-cached: PLZ → Ort autofill)
Sales ─login─▶ /dashboard (reads under RLS; writes only via Postgres functions: claim / release / status / note)
               /dashboard/report · POST /dashboard/export (XLSX of the current filter)
Vercel cron 04:00 UTC ─▶ /api/cron/maintenance (keep-alive query, mail + enrichment retries, close mails older than 24 h)
GitHub Actions daily ─▶ /api/health (liveness + backlog counts, no lead data)
```
If the database is unreachable at submit, the lead is mailed to a fallback inbox and the user still sees success (`202`); otherwise `503` with an honest error message (and a phone number if `NEXT_PUBLIC_CONTACT_PHONE` is configured).

Key decisions (summary in [NOTES.md](NOTES.md), details in [DECISIONS.md](DECISIONS.md)):
- Save first, side effects later (each with a status column, attempt cap and daily retry).
- Accept and flag instead of reject.
- Store facts, derive verdicts at read time (channel, service area, badges).
- Atomic claim via a row lock; duplicates inherit the owner.
- XLSX instead of CSV, with every text cell typed as text.
- No cookies on the public form, no localStorage, no pixels: attribution comes from the URL at submit. (The dashboard uses Supabase auth cookies for the login session.)

## Local development
```bash
npm install
cp .env.example .env.local   # fill in values
npm run dev
npm test                     # Vitest
npx tsc --noEmit && npm run lint && npm run build
```
Database setup (Supabase SQL editor):
1. Apply `supabase/migrations/0001_schema.sql` … `0005_phone_extension.sql` in order. `0004` adds the `sending` claim state for confirmation mails, `0005` the `phone_extension` column.
2. In Authentication settings, **disable public sign-ups** (every logged-in user can read all leads, by design).
3. Create the sales users in Supabase Auth, then give each a display name:
   ```sql
   insert into public.profiles (id, display_name)
   select id, 'Vertrieb A' from auth.users where email = '<user-a email>';
   ```

Seed the five samples (posts through the real API, so it exercises the whole pipeline; fixed idempotency keys make a re-run a replay, not a duplicate; exits non-zero if a sample is not stored):
```bash
node scripts/seed-samples.mjs https://<your-deployment>
```

## Environment variables
See `.env.example`.
- **Server-only:** `SUPABASE_SECRET_KEY`, `BREVO_API_KEY`, `MAIL_SENDER_EMAIL`, `MAIL_SENDER_NAME`, `MAIL_REPLY_TO`, `FALLBACK_INBOX`, `CRON_SECRET`, `NOMINATIM_CONTACT` (required by the Nominatim usage policy), `PRIVACY_CONTACT_EMAIL`, `APP_BASE_URL`.
- **Public:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_CONTACT_PHONE`.
- **GitHub Actions:** repository variable `APP_BASE_URL` for the keep-alive workflow.

## Project structure
- `app/` — routes: form (`/`), `/datenschutz`, `/login`, `/dashboard` (list, `report`, `export`), `api/leads`, `api/plz/[plz]`, `api/health`, `api/cron/maintenance`.
- `middleware.ts` — Supabase session refresh and the `/dashboard` → `/login` redirect (Next 15 naming). Every dashboard page, action and route handler checks the session again itself.
- `lib/` — pure, unit-tested logic plus thin clients:
  - `leads/` (schema, normalize, dedupe, create, side effects, derive), `attribution/` (capture, classify)
  - `enrichment/` (OpenPLZ, Nominatim, evaluate), `geo/` (distance, service area), `config/` (`service-area.ts` is the one file to change once Planeco defines its area)
  - `email/` (Brevo, confirmation rules, MX check, fallback), `dashboard/` (filters, paged loading), `export/xlsx.ts`, `report.ts`, `maintenance/`, `labels.ts`
- `supabase/migrations/` — schema, functions (`claim_lead`, `release_lead`, `set_lead_status`, `set_lead_note`), RLS, `0004`/`0005` additions.
- `scripts/seed-samples.mjs` — the five case samples.
- `tests/` — Vitest, 441 tests. Fixtures are the case samples and recorded real OpenPLZ/Nominatim responses; `tests/unit/edge-cases.test.ts` covers the edge-case list beyond the samples (duplicates, phone formats, email, addresses, abusive input, attribution).

## Tested on
Automated: `npm test` (441 passing), `npx tsc --noEmit`, `npm run lint` and `npm run build` are clean.

Verified against production / the live database:
- **Case samples (production, seeded via the real API):** all five stored and enriched as listed above — #1 house-level, PLZ mismatch (found 01097), Sachsen; #2 `address_unknown` + `ambiguous`, no coordinates; #3 street-level, PLZ mismatch (found 20255), DE-HH; #4 linked to #1 as duplicate (phone + address); #5 postcode-level, DE-SH, ~55 km from Hamburg. Test addresses were not mailed (`test_domain`). Re-running the seed replays (HTTP 200) and creates no new rows.
- **Claiming (C-1):** two concurrent `claim_lead` calls on the same lead → exactly one wins (row lock).
- **Mail claim:** two concurrent mail claims → exactly one sends; a claim stuck in `sending` for more than 10 minutes is retried.
- **Access (C-7):** RPC calls without a session are denied (401 / `42501`); `/dashboard` redirects to `/login` when logged out; the export is POST-only (GET → 405) and checks the session itself.
- **Confirmation mail:** delivered locally and in production; the throttle (one per address per 24 h) and the test-domain skip work; a production send that failed was retried and delivered by the daily job.
- **Operations (O-1):** the production cron answers 401 without the secret and runs with it (its first step is the keep-alive query). The GitHub Actions ping is configured. The DB-down fallback (fallback inbox → `202`, otherwise `503` with an honest error message (and a phone number if `NEXT_PUBLIC_CONTACT_PHONE` is configured)) is implemented but has not been exercised against a paused project.
- **Config:** Supabase public sign-up was found **enabled** despite the setup steps; it is now off (checked in the Supabase dashboard).

### Manual checks (to be completed before submission)
- [ ] iPhone Safari: form submits, success state readable without zooming
- [ ] Android Chrome: same
- [ ] Confirmation mail in Gmail — inbox or spam? (O-2)
- [ ] Confirmation mail in GMX or web.de — inbox or spam? (O-2)
- [ ] Two browsers, Vertrieb A and B: A claims, B gets "Bereits von … übernommen", B's status edit is disabled (C-2)
- [ ] Expired session on the dashboard → redirect to login, no partial write (C-4)
- [ ] Excel export opens with `+49 40 / 123 456` and `Groß Grönau` intact
- [ ] Offline submit on a phone: German error, input stays in the form (F-8)
- [ ] GitHub Actions keep-alive: first scheduled run is green (O-1)
