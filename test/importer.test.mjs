import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCatalog, discover, fingerprint, parseLookup } from '../scripts/importer.mjs';

const now = '2026-09-11T12:00:00Z';
const source = { label: 'Synthetic fixture', url: 'https://example.com/fixture', checkedAt: now };
const empty = { schemaVersion: 1, year: 2026, updatedAt: null, releases: [], songs: [] };
const roster = [{ id: 'fixture', name: 'אמן בדיקה', eligibility: { artist: 'אמן בדיקה', isIsraeli: true, monthlyListeners: 50000, source } }];
function fixture(id = 1, date = '2026-01-02', recordingId = 'recording-test') {
  const payload = { resultCount: 2, results: [
    { wrapperType: 'collection', collectionId: id, artistName: 'Fixture', collectionName: 'בדיקה', releaseDate: date + 'T12:00:00Z', trackCount: 1 },
    { wrapperType: 'track', kind: 'song', collectionId: id, trackId: id * 10, artistName: 'Fixture', trackName: 'שיר בדיקה', releaseDate: date + 'T12:00:00Z' }
  ] };
  const review = { collectionId: id, fingerprint: fingerprint(payload), qualifyingArtist: 'fixture', type: id === 1 ? 'single' : 'album', title: 'בדיקה', artists: ['אמן בדיקה'], releaseDate: date, genres: [], reviewedAt: now, sources: [source],
    tracks: [{ trackId: id * 10, recordingId, title: 'שיר בדיקה', artists: ['אמן בדיקה'], firstReleaseDate: date, languageSource: source }] };
  return { payload, review };
}
test('approved import is idempotent and retains last data-change timestamp', () => {
  const { payload, review } = fixture();
  const first = buildCatalog(empty, [review], roster, new Map([[1, payload]]), now);
  const second = buildCatalog(first.catalog, [review], roster, new Map([[1, payload]]), '2026-09-12T12:00:00Z');
  assert.equal(first.changed, true); assert.equal(second.changed, false);
  assert.deepEqual(second.catalog, first.catalog); assert.equal(empty.songs.length, 0);
});
test('reviewed single/album recording identity merges appearances and uses earliest date', () => {
  const a = fixture(), b = fixture(2, '2026-02-01');
  const result = buildCatalog(empty, [a.review, b.review], roster, new Map([[1, a.payload], [2, b.payload]]), now);
  assert.equal(result.catalog.songs.length, 1);
  assert.deepEqual(result.catalog.songs[0].releaseIds, ['apple-release-1', 'apple-release-2']);
  assert.equal(result.catalog.songs[0].releaseDate, '2026-01-02');
});
test('live versions with distinct approved identities remain separate', () => {
  const a = fixture(), b = fixture(2, '2026-02-01', 'recording-live');
  const result = buildCatalog(empty, [a.review, b.review], roster, new Map([[1, a.payload], [2, b.payload]]), now);
  assert.equal(result.catalog.songs.length, 2);
});
test('changed provider metadata is queued and cannot overwrite a verified catalog', () => {
  const { payload, review } = fixture();
  const first = buildCatalog(empty, [review], roster, new Map([[1, payload]]), now);
  const changed = structuredClone(payload); changed.results[1].trackName = 'Unexpected replacement';
  const second = buildCatalog(first.catalog, [review], roster, new Map([[1, changed]]), now);
  assert.deepEqual(second.catalog, first.catalog);
  assert.equal(second.pending[0].reason, 'provider-metadata-changed');
});
test('partial or malformed provider responses fail without mutating published data', () => {
  const { payload, review } = fixture();
  const partial = { resultCount: 1, results: [payload.results[0]] };
  assert.throws(() => buildCatalog(empty, [review], roster, new Map([[1, partial]]), now), /Incomplete/);
  assert.deepEqual(empty, { schemaVersion: 1, year: 2026, updatedAt: null, releases: [], songs: [] });
  assert.throws(() => parseLookup({ resultCount: 0, results: [] }, 'artist', 1), /requested/);
});
test('discovery excludes old/future/approved releases, deduplicates collaborations and does not auto-publish', () => {
  const rows = [
    { wrapperType: 'collection', collectionId: 2, collectionName: 'מועמד', artistName: 'Fixture', releaseDate: '2026-05-01' },
    { wrapperType: 'collection', collectionId: 3, releaseDate: '2025-05-01' },
    { wrapperType: 'collection', collectionId: 4, releaseDate: '2026-12-01' }
  ];
  assert.equal(discover([{ results: rows }, { results: rows }], [], now).length, 1);
  assert.equal(discover([{ results: rows }], [{ collectionId: 2 }], now).length, 0);
});
test('expired eligibility blocks new imports; featured-only and conflicting recording credits fail', () => {
  const { payload, review } = fixture();
  const expired = structuredClone(roster); expired[0].eligibility.source.checkedAt = '2026-01-01T00:00:00Z';
  const result = buildCatalog(empty, [review], expired, new Map([[1, payload]]), now);
  assert.equal(result.catalog.releases.length, 0); assert.equal(result.pending[0].reason, 'eligibility-observation-expired');
  const guest = structuredClone(review); guest.artists = ['אמן אחר'];
  assert.throws(() => buildCatalog(empty, [guest], roster, new Map([[1, payload]]), now), /qualifying/);
});
