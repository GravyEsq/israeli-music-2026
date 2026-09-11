# מוזיקה ישראלית · 2026

שלד למעקב אחר מוזיקה ישראלית חדשה בעברית בשנת 2026. הממשק בעברית ובכיווניות RTL, עם שלוש טבלאות נפרדות: סינגלים, אלבומים וכל השירים. בכל טבלה יש חיפוש, סינון לפי אמן וז׳אנר ומיון באמצעות כותרות העמודות, כולל תאריך ופופולריות.

**המאגר ריק בכוונה. אין עדיין איסוף נתונים, חישוב פופולריות או אתר שפורסם.** ה־Action היומי הוא placeholder בלבד. אין צורך במפתחות API להרצת השלד.

## Run locally

Requires Node.js 22 or later and npm:

```sh
npm ci
npm run check
npm run dev
```

Open `http://127.0.0.1:5173`. Serve over HTTP; opening `index.html` directly as a file will not load JSON/modules reliably. Set `PORT` to change the local port. The development server binds to loopback and serves only `public/`.

The frontend is plain HTML, CSS and JavaScript with no runtime dependencies or build step. Only validation uses npm packages. The `public/` directory can later be hosted on GitHub Pages or any static host, including under a repository subpath. Publishing is not configured in this scaffold.

## Structure

```text
public/
  index.html                 Hebrew RTL interface
  styles.css                 Responsive layout
  app.js                     Accessible table controls and rendering
  lib/catalog.js             Pure filtering, sorting and table projections
  data/releases.json         Canonical, initially empty catalog
  data/releases.schema.json  JSON Schema draft-07
scripts/
  validation.mjs             Schema and cross-record integrity checks
  validate-data.mjs          Validation command
  update-data.mjs            Explicit no-op updater
  serve.mjs                  Local static server
test/                        Synthetic fixtures, never served to users
.github/workflows/
  ci.yml                     Validate pushes to main and pull requests
  daily-update.yml           Daily no-op + validation, also manually runnable
```

## Data contract and scope

- Track Hebrew-language music released in 2026. At least one primary artist must be Israeli and meet the agreed threshold of 50,000 monthly listeners. Record the source and observation date for eligibility; do not infer eligibility from featured artists or assume it remains current.
- `releases` contains single/album release entities. `songs` contains one record per distinct recording, including album tracks. A song appearing as a single and later on an album has multiple `releaseIds`, not duplicate song records.
- `releaseDate` on a song is its first release date, not the later album appearance. Previously released songs from earlier years are outside the 2026 song catalog. An album record may link only its eligible new Hebrew tracks; it does not assert a complete tracklist. EP classification remains a future editorial decision.
- Use stable local IDs. ISRC is optional (`null` when unknown); known duplicate ISRCs and IDs are rejected. When ISRC is unavailable, future collection must reconcile provider IDs and metadata, with manual review for uncertain matches.
- Each record includes primary `artists`, `language: "he"`, `genres` (empty when unknown), verification `sources` with HTTPS links and `checkedAt`, and `eligibility` evidence. Source and artist assertions still need human/provider verification; schema validation alone cannot prove them.
- `popularity` is `null` until a methodology is implemented. A future value requires a 0–100 `score`, `method` description and dated `source`. This is not a stream count. Unknown values display as a dash and sort last in either direction. Do not fabricate scores or use zero for missing data.
- Top-level `updatedAt` remains `null` until the first verified data import. Change it only when verified catalog content changes, not for every scheduled check.
- Use full ISO dates (`YYYY-MM-DD`) and timezone-qualified timestamps. Partial or uncertain dates must be resolved before publication. Every release needs at least one linked song; every song must reference existing releases. The validator checks these links and primary-artist eligibility membership.

Run `npm run validate` after any manual data edit; it validates against the schema and checks catalog integrity. `npm test` covers filtering, sorting, deduplication structure and invalid input using explicitly synthetic fixtures only.

## Daily workflow and next implementation step

`daily-update.yml` schedules a run at **03:17 UTC daily**, and supports manual dispatch. GitHub may delay scheduled runs or disable them after prolonged repository inactivity. This is not a guarantee of an exact daily run time.

The placeholder logs that collection is unconfigured, validates the catalog, runs tests and verifies that no tracked data changed. It has read-only repository permissions and never commits, fetches release metadata, or updates timestamps. CI validates pushes and pull requests independently.

To implement collection later:

1. Choose permitted metadata sources and record provenance, eligibility observations and language verification.
2. Fetch into a temporary candidate catalog; normalize and reconcile stable IDs/ISRCs before updating canonical data.
3. Validate the entire candidate, review ambiguous matches, and write atomically only after successful verification. Preserve the current catalog on provider failures.
4. Define the popularity methodology separately, keeping missing values null.
5. Add required secrets through GitHub Actions secrets, never in committed files. Add narrowly scoped write permissions and an intentional commit/PR publishing step only when a real updater is ready.

The tracker stores metadata and source links only. Audio, lyrics and copied cover artwork are not part of the scaffold. Source-specific licensing and API terms must be checked when integrating providers.
