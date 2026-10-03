# Notes — Standort-Check

**Time:** Built over several sessions with AI coding agents (Claude Code); beyond the 6 h guideline because I spent the extra time on tests, independent review rounds and live checks.

## Decisions
1. **Save first.** Mail and enrichment are retryable side effects after the response; if the database is down, the lead goes to a fallback inbox.
2. **Accept and flag, don't reject.** Missing house numbers, unknown addresses and odd phone formats reach Sales with a flag.
3. **Store facts, derive verdicts.** Raw UTMs and geodata are stored; channel and service area are computed at read time, so a config change re-evaluates history.
4. **One owner per lead, enforced by the database.** Claiming locks the row; duplicates (same email, phone or address within 90 days) inherit the owner.
5. **Evidence, not dots.** Sales sees "Randlage · Hamburg 55 km · Nur PLZ-genau"; a geocoder hit counts only after it matches the typed street.

## Open question for Planeco: the service area
The brief leaves the "Einzugsgebiet" open. I assumed the metro hubs with Planeco city pages (Hamburg, Berlin, München, Köln, Frankfurt, Düsseldorf, Stuttgart), 50 km plus a 15 km edge band. It lives in one file (`lib/config/service-area.ts`); changing it re-evaluates every past lead.

## Open
1. **Deliverability:** without an own domain, Brevo rewrites the Gmail sender to @brevosend.com; confirmations can land in spam.
2. **DB-down fallback untested:** implemented (fallback inbox, `202`), but neither exercised against a paused database nor covered by a test.
3. **Flat permissions:** every logged-in user reads all leads and can edit any note. Safe only while public sign-up stays off.
4. **Attribution under-counts, no IP rate limit:** a submission days after the ad click, or from an in-app browser that strips UTMs, counts as "Direkt" (no cookies). Repeated submissions from one IP are all stored; only the mail throttle limits damage.
5. **Not licensed for commercial production:** public Nominatim (1 req/s) and Vercel Hobby (non-commercial); Supabase Free also pauses after 7 idle days and has no backups.

## If this went live tomorrow
1. Own domain with SPF/DKIM/DMARC, Reply-To to a sales inbox, bounce webhook.
2. Legal: DPAs, retention and deletion job, final privacy text.
3. Paid tiers, a licensed geocoder, alerts on failed inserts, failed mails and the `/api/health` backlog; a DB-down drill.
4. Speed-to-lead: an instant alert for in-area leads. Today Sales only sees a lead when they open the dashboard.
5. Send qualified and won leads back to Google Ads (offline conversions via gclid) and Meta (Conversions API), so bidding optimises for good leads, not form fills.
6. CRM integration; Planeco's Heyflow/Webflow forms post to the same API.

## Where AI tools or APIs were wrong
- **Photon** returned Thadenstraße 88 for Osterstraße 88 as a confident house-level hit. Every geocoder hit is now checked against the typed street.
- **AI-drafted intake code** let a client-clock spam timer silently drop real leads and treated every database error as an outage (misleading fallback mails). Caught in review; fixed with a browser-measured fill time and error classification.
- **The AI-drafted mail step could double-send** (post-response job and daily cron). A second review caught a window in the first fix; final fix: a `sending` claim with a 10-minute lease, tested live.

Details: [DECISIONS.md](DECISIONS.md) (shortcuts S1–S12, what was not built, further weaknesses, all corrections).
