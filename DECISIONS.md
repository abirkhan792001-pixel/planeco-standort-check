# Decisions and details — Standort-Check

The one-page summary is [NOTES.md](NOTES.md). This file holds the detail behind it.

Built with Claude Code from a spec and plan I worked out with it; every task got a separate review pass, and the risky paths were checked live.

## Decisions and why
1. **Save first; everything else is a retryable side effect.** A lost paid lead is the most expensive failure. Mail and enrichment run after the response, each with a status column, an attempt cap and a daily retry; if the DB is down, the lead goes to a fallback inbox.
2. **Accept and flag instead of reject.** Only unusable leads are blocked; missing house numbers, unknown addresses and odd phone formats are accepted and flagged for Sales.
3. **Store facts, derive verdicts.** Raw UTMs and geodata are stored; channel and service area are computed at read time, so a config change re-evaluates history.
4. **One owner per lead, enforced by the database.** Claiming locks the root row; duplicates (same email, phone or plot within 90 days, never the name alone) inherit the owner. Personal logins show who works what.
5. **Evidence, not dots.** Sales sees "Randlage · Hamburg 55 km · Nur PLZ-genau"; a geocoder hit counts only after it is checked against the typed street.

## Assumptions
- **Service area** (open question for Planeco, see NOTES): metro hubs where Planeco publishes city pages (Hamburg, Berlin, München, Köln, Frankfurt, Düsseldorf, Stuttgart), 50 km + 15 km edge band. One config file, `lib/config/service-area.ts`.
- ≤ 100 leads/day; Sales is 2–5 people with Excel; ads link straight to this page; plots in Germany only.
- **Manual search-ad tagging:** `utm_source` google or bing (any case) with a paid medium (`cpc`, `ppc`, `paid`, …) and no click id counts as Paid Search (Google Ads / Microsoft Ads), for campaigns tagged by hand or with auto-tagging off. Other paid sources show as "Paid – <source>".

## Not built
Address autocomplete (Nominatim's policy forbids it; PLZ → Ort autofill instead) · a map (an OSM link per lead) · realtime updates (the lock guarantees correctness) · CRM features and merging duplicates (Planeco should integrate a CRM) · CAPTCHA, cookie banner, pixels (no friction without evidence of spam; no cookies on the public form) · cadastral lookup (16 state services) · automated plot analysis (B-Plan, §34/§35 BauGB): out of scope for a lead funnel.

## Shortcuts (built, but simpler than production)
| # | Shortcut | Fine now because | Revisit when |
|---|---|---|---|
| S1 | Service area = hub radius circles | "Einzugsgebiet" undefined; one file to swap | Planeco defines it, or Sales often overrides |
| S2 | Attribution from the URL at submit only | no cookies, no consent banner | many "Direkt" leads, or a multi-page site |
| S3 | Honeypot + minimum fill time, no CAPTCHA | no friction on paid traffic | spam appears → Turnstile, then rate limit |
| S4 | Public Nominatim (1 req/s, OSM data) | free; verdict needs only the municipality | bursts, many "street not found", commercial use |
| S5 | Duplicate = email **or** phone **or** address | a false link is cheap; double calls are not | Sales often un-links (shared family email) |
| S6 | No `+tag`/Gmail-dot folding | a wrong fold links strangers | duplicates differ only there |
| S7 | IDN email domains rejected | rare, badly supported | a real customer complains |
| S8 | Simultaneous submits from two tabs can both become roots | needs an advisory lock | it shows up in the data |
| S9 | Retries = `after()` + one daily job, no queue | status columns make steps resumable | mail must go out minutes after an outage |
| S10 | Two hand-made demo users | Sales is 2–5 people | the team changes |
| S11 | XLSX built in one call (≤ 5,000 rows) | fine for thousands of rows | exports near the function time limit |
| S12 | Free tiers: Vercel Hobby (non-commercial), Supabase Free (pauses after 7 idle days, no backups) | zero cost required; daily cron + GitHub ping keep it awake | going live |

## Known weaknesses
The top five are in NOTES ("Open"). Further:
- **Bounces:** hard bounces show only in the Brevo log (no webhook).
- **Attribution:** YouTube/Pinterest referrers count as "Referral".
- **Nominatim/OSM:** coverage gaps (the case's "Am Mühlenteich" is in neither OSM nor OpenPLZ); the free-text "Adresse unbekannt" note is sent to Nominatim as typed. A "Flurstück …" resolves to the town at best.
- **Dedupe gaps:** a house number typed into the street field gives a different address key; near-simultaneous duplicates (S8).
- **Phone extension heuristic:** "04101-1234" (5-digit area code + 4-digit number, one hyphen) is read as number + extension; the remaining "04101" is too short, so the lead gets no E.164 number (flagged invalid; the raw input stays visible to Sales) and phone-based duplicate matching misses it.
- **Claim-time metric:** a re-claim or forced claim resets `assigned_at`, so "Ø Std. bis Übernahme" runs to the latest claim, not the first, and can overstate the time to first pickup; a released lead drops out of the average.
- **Test and real leads are kept apart in duplicate detection (decision):** a test lead (`?test=1` or a reserved email domain) is never linked to a real lead or vice versa, so a reviewer's test cannot inherit a real customer's owner or hide as that customer's duplicate. Cost: someone who first submitted with `?test=1` starts a fresh group when they return for real.
- **Rare double mail:** if the status write fails after Brevo accepted a mail, the claim expires after 10 min and the retry sends again.
- **Test gaps:** no automated tests for the DB-down fallback or the report page rendering. The form needs JavaScript to submit.

## Where AI tools or APIs were wrong (full log)
- **Photon** returned a different street as a confident house-level hit (Thadenstraße 88 for Osterstraße 88; Am Sonnenberg 7 for Am Mühlenteich 7) → every geocoder hit is verified against the typed street.
- **Nominatim** has no `state` for Hamburg (city-state), so naive code shows no federal state for Planeco's home market → state taken from the ISO 3166-2 code / OpenPLZ.
- **An AI agent hid a dependency conflict** with `--legacy-peer-deps`: green locally, `npm install` failed on Vercel (ERESOLVE). Noticed via the failed first deploy → fixed the `@types/node` version instead of forcing.
- **Supabase sign-up was still enabled** despite the setup steps. A review noted that "every user reads all leads" is safe only with sign-ups off; the Supabase dashboard showed them on → switched off.
- **Dedupe plan code** missed "Hauptstr.14" and merged phone extensions into the number. The first fix introduced a regression ("Fax 040…" gave no number), caught by the scoped re-review → fixed with a digit lookbehind.
- **Lead intake plan code** let emoji-heavy input violate a DB `CHECK` (JS UTF-16 length vs Postgres code points), treated every DB error as an outage (misleading fallback mails), and used a client-clock spam timer that could silently drop real leads → code-point counting, error classification, browser-measured fill time.
- **Form:** a browser test found focus jumping to the wrong field and, by clicking submit before hydration, a native GET that would put personal data into the URL → button disabled until hydrated, `method=post`. Review added: the success text promised a mail that is not always sent; a stale city after a PLZ change.
- **Mail step:** the plan had no claim, so the post-response job and the cron could double-send; the first fix (optimistic attempts lock) still left a window, caught by a scoped re-review → `sending` state with a lease, tested live. Also: a bad Brevo key (401) would have marked every lead's mail permanently "rejected".
- **Channel rule vs README:** the README said sample #3 (`utm_source=google`, `utm_medium=cpc`) shows as Google Ads, but the spec-literal rule classified it as "Paid – google" (Paid Other). Caught by the docs review cross-checking claims against code → google/bing + paid medium = Paid Search (see Assumptions).
- Final whole-project review found a third-submission gap in duplicate detection (earliest root closed → new open root beside an open one) that per-task reviews missed; fixed and tested.

### Test pitfalls
- A curl test from Git Bash on Windows sent cp1252, not UTF-8, and stored "Osterstra�e" with a `201`. Noticed by reading the DB row. Browsers always send UTF-8; the seed script uses Node `fetch`.
