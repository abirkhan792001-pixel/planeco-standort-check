# Notes — Standort-Check

**Time:** core build ≈ __ h, extras ≈ __ h — beyond the 6 h guideline, deliberately and disclosed.

## Decisions and why
1. **Save first; everything else is a retryable side effect.** A lost paid lead is the most expensive failure. Mail and enrichment run after the response, with status and daily retry; if the DB is down, the lead goes to a fallback inbox.
2. **Accept and flag instead of reject.** Only unusable leads are blocked; missing house numbers, unknown addresses and odd phone formats are accepted and flagged for Sales.
3. **Store facts, derive verdicts.** Raw UTMs and geodata are stored; channel and service area are computed at read time, so a config change re-evaluates history.
4. **One owner per lead, enforced by the database.** Claiming locks the root row; duplicates (same email, phone or plot within 90 days, never the name alone) inherit the owner. Personal logins show who works what.
5. **Evidence, not dots.** Sales sees "Randlage · Hamburg 55 km · Nur PLZ-genau"; a geocoder hit counts only after it is checked against the typed street.

## Deliberately not built
Address autocomplete (Nominatim's policy forbids it; PLZ → Ort autofill instead) · a map (an OSM link per lead) · realtime updates (the lock guarantees correctness) · CRM features and merging duplicates (Planeco should integrate a CRM) · CAPTCHA, cookie banner, pixels (no friction without evidence of spam; no cookies used) · cadastral lookup (16 state services) · automated plot analysis (B-Plan, §34/§35 BauGB): the product vision, not the funnel.

## Assumptions
- **Service area:** metro hubs where Planeco publishes city pages (Hamburg, Berlin, München, Köln, Frankfurt, Düsseldorf, Stuttgart), 50 km + 15 km edge band. One config file, pending Planeco's definition.
- ≤ 100 leads/day; Sales is 2–5 people with Excel; ads link straight to this page; plots in Germany only.

## Deliberate shortcuts (built, but simpler than production)
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
| S12 | Free tiers: Vercel Hobby (non-commercial), Supabase Free (pauses after 7 idle days, no backups) | zero cost required; daily cron + GitHub ping keep it awake | going live (below) |

## Known weaknesses
- **Deliverability:** without an own domain, Brevo rewrites the Gmail sender to @brevosend.com; confirmations can land in spam. Hard bounces show only in the Brevo log (no webhook).
- **Attribution under-counts:** a click today and a submission in three days is "Direkt" (the price of no cookies), as is an in-app browser that strips UTMs. YouTube/Pinterest referrers count as "Referral".
- **No IP rate limit:** 20 submissions from one IP are all stored; only the mail throttle (one per address per 24 h) limits damage.
- **Nominatim/OSM:** coverage gaps (the case's "Am Mühlenteich" is in neither OSM nor OpenPLZ); not for commercial production; the free-text "Adresse unbekannt" note is sent as typed. A "Flurstück …" resolves to the town at best.
- **Dedupe gaps:** a house number typed into the street field gives a different address key; near-simultaneous duplicates (S8).
- **Flat permissions:** every logged-in user reads all leads and can edit any note — safe only because public sign-up is off.
- **Rare double mail:** if the status write fails after Brevo accepted a mail, the claim expires after 10 min and the retry sends again.
- **Test gaps:** no automated tests for the DB-down fallback or the report page rendering. The form needs JavaScript to submit.

## If this went live tomorrow
1. Own domain + SPF/DKIM/DMARC, Reply-To to a sales inbox, bounce webhook.
2. Legal: DPAs, retention and deletion job, final privacy text.
3. Alerts on failed inserts, mails and the `/api/health` backlog; paid tiers.
4. Close the loop with the ad platforms: qualified/won back via Google Ads offline conversions (gclid) and the Meta Conversions API, so bidding optimises for good leads, not form fills.
5. CRM integration; this dashboard becomes a transition tool.
6. Speed-to-lead: instant alert for in-area leads (with a morning batch, a lead from 09:05 waits ~23 h).
7. Let Planeco's Heyflow/Webflow forms post to the same API for dedupe, enrichment and the dashboard.

## Where AI tools or APIs were wrong, and how I noticed
Built with Claude Code from a spec and plan I worked out with it; every task got a separate review pass and live checks.
- **Photon** returned a different street (Thadenstraße 88 for Osterstraße 88) as a confident house-level hit → every hit is now verified against the typed street.
- **Nominatim** has no `state` for Hamburg (city-state), so naive code shows no federal state for Planeco's home market → ISO 3166-2 code used.
- **Supabase sign-up was still enabled** despite the setup steps. A review said "all users read all leads" is safe only with sign-ups off; I checked instead of assuming and switched it off.
- **An AI agent hid a dependency conflict** with `--legacy-peer-deps`: green locally, failed on Vercel → fixed the version instead of forcing.
- **A 201 that wasn't fine:** a curl test from Git Bash on Windows stored "Osterstra�e" (cp1252). Noticed by reading the DB row, not the status code.
- **The AI-drafted mail step could double-send** (post-response job and cron). The first fix still left a window, caught by a second review → `sending` claim with a 10-min lease, live-tested.
- **Submit before hydration** sent a native GET that would put personal data into the URL. Found in a live browser test → button waits for hydration, form is POST-only.
