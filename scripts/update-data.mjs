import { readFile, writeFile, rename, mkdir, rm } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { parseLookup, discover, buildCatalog } from './importer.mjs';

const root = new URL('../', import.meta.url);
const read = async path => JSON.parse(await readFile(new URL(path, root), 'utf8'));
async function save(path, value) {
  const destination = new URL(path, root), temporary = new URL(`${path}.tmp`, root);
  try { await writeFile(temporary, JSON.stringify(value, null, 2) + '\n'); await rename(temporary, destination); }
  finally { await rm(temporary, { force: true }); }
}
async function lookup(id, kind) {
  const url = `https://itunes.apple.com/lookup?id=${id}&entity=${kind === 'artist' ? 'album' : 'song'}&country=il&limit=200`;
  for (let attempt = 0; attempt < 3; attempt++) {
    await delay(3200);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(20000), headers: { 'User-Agent': 'IsraeliMusic2026/0.2 (https://github.com/GravyEsq/israeli-music-2026)' } });
      if (!response.ok) throw new Error(`Apple HTTP ${response.status} for ${id}`);
      return parseLookup(await response.json(), kind, id);
    } catch (error) { if (attempt === 2) throw error; await delay(2000 * 2 ** attempt); }
  }
}
const now = new Date().toISOString();
const roster = await read('config/artists.json'), reviews = await read('config/reviews.json');
const previous = await read('public/data/releases.json');
let oldStatus = {};
try { oldStatus = await read('public/data/status.json'); } catch { /* First run. */ }
try {
  const artistPayloads = [];
  for (const artist of roster) artistPayloads.push(await lookup(artist.appleArtistId, 'artist'));
  const payloads = new Map();
  for (const review of reviews) payloads.set(review.collectionId, await lookup(review.collectionId, 'album'));
  const result = buildCatalog(previous, reviews, roster, payloads, now);
  const pending = [...discover(artistPayloads, reviews, now), ...result.pending];
  const expiredArtists = roster.filter(a => Date.parse(now) - Date.parse(a.eligibility.source.checkedAt) > 30 * 86400000).map(a => a.name);
  await mkdir(new URL('data/', root), { recursive: true });
  // Finish every fetch and validation before replacing the canonical catalog.
  await save('data/pending-review.json', { candidates: pending });
  if (result.changed) await save('public/data/releases.json', result.catalog);
  await save('public/data/status.json', { state: 'ok', lastAttempt: now, lastSuccess: now, pendingCount: pending.length, expiredArtists, artists: roster.map(a => a.name), coverage: 'pilot', mode: 'discovery-with-editorial-review' });
  console.log(`Checked ${roster.length} artists. ${result.catalog.releases.length} published releases, ${pending.length} awaiting review. Catalog changed: ${result.changed}.`);
} catch (error) {
  await save('public/data/status.json', { ...oldStatus, state: 'failed', lastAttempt: now, artists: roster.map(a => a.name), coverage: 'pilot', mode: 'discovery-with-editorial-review' });
  console.error(`Update failed; previous catalog retained. ${error.message}`);
  process.exitCode = 1;
}
