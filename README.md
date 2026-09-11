# מוזיקה ישראלית · 2026

מעקב אחר מוזיקה ישראלית חדשה בעברית בשנת 2026. הממשק בעברית ובכיווניות RTL, עם שלוש טבלאות נפרדות: סינגלים, אלבומים וכל השירים. בכל טבלה יש חיפוש, סינון לפי אמן וז׳אנר ומיון באמצעות כותרות העמודות, כולל תאריך ופופולריות.

**פיילוט עם נתונים אמיתיים: אודיה, עומר אדם ועדן חסון. הכיסוי חלקי.** האיסוף היומי מאתר ריליסים ומכין רשימת מועמדים; פרסום רשומה חדשה מחייב בדיקת שפה, אמנים ראשיים וזהות ההקלטה. מדד הפופולריות עדיין לא מחושב. אין צורך במפתחות API.

[פתיחת האתר](https://gravyesq.github.io/israeli-music-2026/) · [מצב הבדיקות והפרסום](https://github.com/GravyEsq/israeli-music-2026/actions)

## Run locally

Requires Node.js 22 or later and npm:

```sh
npm ci
npm run check
npm run dev
```

Open `http://127.0.0.1:5173`. Serve over HTTP; opening `index.html` directly as a file will not load JSON/modules reliably. Set `PORT` to change the local port. The development server binds to loopback and serves only `public/`.

The frontend is plain HTML, CSS and JavaScript with no runtime dependencies or build step. Only validation uses npm packages. `pages.yml` validates and publishes only `public/` to GitHub Pages. Project configuration and the review queue remain in the repository, outside the served directory.

## Structure

```text
public/
  index.html                 Hebrew RTL interface
  styles.css                 Responsive layout
  app.js                     Accessible table controls and rendering
  lib/catalog.js             Pure filtering, sorting and table projections
  data/releases.json         Canonical verified catalog
  data/releases.schema.json  JSON Schema draft-07
  data/status.json           Last attempt/success, coverage and review count
config/
  artists.json               Pilot roster, provider IDs and eligibility evidence
  reviews.json               Explicit release/track approvals and fingerprints
data/pending-review.json      Discovered candidates, not published song records
scripts/
  validation.mjs             Schema and cross-record integrity checks
  validate-data.mjs          Validation command
  update-data.mjs            Rate-limited discovery, retries and atomic writes
  importer.mjs               Pure discovery, verification and recording merge
  serve.mjs                  Local static server
test/                        Synthetic fixtures, never served to users
.github/workflows/
  ci.yml                     Validate pushes to main and pull requests
  daily-update.yml           Daily discovery, commit and publish
  pages.yml                  GitHub Pages deployment (also reusable)
```

## Data contract and scope

- Track Hebrew-language music released in 2026. At least one primary artist must be Israeli and meet the agreed threshold of 50,000 monthly listeners. Record the source and observation date for eligibility; do not infer eligibility from featured artists or assume it remains current.
- `releases` contains single/album release entities. `songs` contains one record per distinct recording, including album tracks. A song appearing as a single and later on an album has multiple `releaseIds`, not duplicate song records.
- `releaseDate` on a song is its first release date, not the later album appearance. Previously released songs from earlier years are outside the 2026 song catalog. An album record may link only its eligible new Hebrew tracks; it does not assert a complete tracklist. EP classification remains a future editorial decision.
- Use stable local IDs. ISRC is optional (`null` when unknown); known duplicate ISRCs and IDs are rejected. Each reviewed provider track maps to an explicit `recordingId`. Assign the SAME recording ID to confirmed single/album appearances; use a separate ID for live, cover and remix recordings. Never merge on title alone. Officially released new cover recordings are eligible, even if the underlying composition is older.
- Each record includes primary `artists`, `language: "he"`, `genres` (empty when unknown), verification `sources` with HTTPS links and `checkedAt`, and `eligibility` evidence. Source and artist assertions still need human/provider verification; schema validation alone cannot prove them.
- `popularity` is `null` until a methodology is implemented. A future value requires a 0–100 `score`, `method` description and dated `source`. This is not a stream count. Unknown values display as a dash and sort last in either direction. Do not fabricate scores or use zero for missing data.
- Top-level `updatedAt` changes only when verified catalog content changes. `status.json` separately records each check, including failures. The frontend warns when the last successful check is over 48 hours old.
- Use full ISO dates (`YYYY-MM-DD`) and timezone-qualified timestamps. Partial or uncertain dates must be resolved before publication. Every release needs at least one linked song; every song must reference existing releases. The validator checks these links and primary-artist eligibility membership.

Run `npm run validate` after any manual data edit; it validates against the schema and checks catalog integrity. `npm test` covers filtering, sorting, deduplication structure and invalid input using explicitly synthetic fixtures only.

## Daily discovery and publishing

`daily-update.yml` schedules a run at **03:17 UTC daily**, and supports manual dispatch. GitHub may delay scheduled runs or disable them after prolonged repository inactivity. This is not a guarantee of an exact daily run time.

`npm run update:data` queries the [public Apple lookup API](https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/LookupExamples.html) for each pilot artist's albums and each reviewed collection's tracks in the Israeli storefront. Requests are spaced by at least 3.2 seconds (under the documented approximate 20/minute limit), with a 20-second timeout and up to three attempts. No audio, previews, artwork, lyrics, prices or credentials are stored. Source links point to Apple Music and the supporting release information.

All responses must complete and the full candidate must validate before the canonical catalog is replaced atomically. Empty/malformed responses, missing requested IDs, incomplete tracklists and the 200-result ceiling fail the check. Failures preserve the previously published catalog. A changed fingerprint creates a review item and retains the existing approved record; it never silently rewrites dates or credits. Removed releases are not deleted automatically.

The scheduled job commits only catalog, queue and status files with the repository's built-in Actions token, then explicitly calls the Pages deployment workflow. This is necessary because a commit made with `GITHUB_TOKEN` does not trigger a separate push workflow. A failed source check still publishes the failure status, then marks the workflow failed. Push races fail without force-pushing or overwriting other work.

For initial setup, set Repository Settings → Pages → Source to **GitHub Actions**. The repository must allow the scoped write permissions in the daily job. Publication uses `pages: write` and `id-token: write`; no personal token or paid service is needed. The daily workflow is also manually runnable from Actions.

## Review and extend the pilot

1. Inspect `data/pending-review.json` and verify the actual release, Hebrew language, primary credits, date and recording identity against source material. Hebrew characters in a title are not evidence of the sung language. Check uncertain collaborations, covers and live versions individually.
2. Keep primary-artist eligibility in `config/artists.json`, including the dated listener observation and Israeli-identity source. Initial counts were read from indexed public Spotify artist pages, not a live API. The notes preserve that distinction. Refresh observations within 30 days before importing new releases; existing entries retain their historical eligibility evidence. Spotify is not scraped by the updater and is not used to calculate popularity.
3. Add an explicit approval in `config/reviews.json`: collection ID, type, title, primary artists, date, sources and approved tracks. Each track needs its provider ID, canonical recording ID, first release date, primary artists and language source. Featured performers may remain in display titles but do not qualify the record by themselves.
4. Compute the fingerprint using exported `fingerprint()` in `scripts/importer.mjs` against the current Apple lookup JSON (`id=COLLECTION_ID&entity=song&country=il&limit=200`). The fingerprint covers identity, track count and dates, excluding unrelated prices/artwork. Do not approve a changed fingerprint without reviewing the changed metadata.
5. Run `npm run update:data` and `npm run check`, inspect the diff, commit and push. A repeat run must leave `releases.json` and `updatedAt` unchanged when the verified data did not change. The queue and successful-check timestamp may change.

The initial batch contains 2 studio albums and 7 singles (34 recordings). It is NOT an exhaustive catalog even for the three pilot artists. EPs, live medleys, duplicate provider editions and uncertain guest appearances remain queued. The Apple artist lookup may omit releases credited to another artist or unavailable in the Israeli storefront. The 200-result guard detects a possible limit but cannot prove complete coverage. Expand providers and roster deliberately; do not claim full-year completeness.

Dates in the pilot are digital release dates from Apple, corroborated with release descriptions. Genre `Pop` is shown as פופ; the broad provider label `Israeli` is not treated as a musical genre. Popularity remains null. No music, lyrics or cover images are hosted.
