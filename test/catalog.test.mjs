import test from 'node:test';
import assert from 'node:assert/strict';
import { rowsFor, selectRows } from '../public/lib/catalog.js';
import { validateCatalog } from '../scripts/validation.mjs';

// Synthetic fixtures only. These are never served as release data.
const source = { label: 'Test fixture', url: 'https://example.com/test', checkedAt: '2026-01-03T00:00:00Z' };
const base = { title: 'בדיקה', artists: ['אמן לבדיקה'], releaseDate: '2026-01-02', language: 'he', genres: ['בדיקה'], popularity: null, sources: [source], eligibility: { artist: 'אמן לבדיקה', isIsraeli: true, monthlyListeners: 50000, source } };
function fixture() {
  return structuredClone({ schemaVersion: 1, year: 2026, updatedAt: '2026-01-03T00:00:00Z',
    releases: [{ ...base, id: 'single-test', type: 'single' }, { ...base, id: 'album-test', type: 'album' }],
    songs: [{ ...base, id: 'song-test', releaseIds: ['single-test', 'album-test'], isrc: null }] });
}
test('empty catalog is valid without pretending an update happened', () => {
  assert.deepEqual(validateCatalog({ schemaVersion: 1, year: 2026, updatedAt: null, releases: [], songs: [] }), []);
});
test('song shared by single and album appears only once in all songs', () => {
  const data = fixture();
  assert.deepEqual(validateCatalog(data), []);
  assert.equal(rowsFor(data, 'single').length, 1);
  assert.equal(rowsFor(data, 'album').length, 1);
  assert.equal(rowsFor(data, 'songs').length, 1);
  assert.deepEqual(rowsFor(data, 'songs')[0].albums, ['בדיקה']);
});
test('filter intersection, date sorting and missing popularity', () => {
  const rows = [{ ...base, id: 'a' }, { ...base, id: 'b', title: 'אחר', releaseDate: '2026-02-01', popularity: { score: 0 } }, { ...base, id: 'c', artists: ['אחר'], popularity: { score: 90 } }];
  assert.deepEqual(selectRows(rows, { query: 'בדיקה', artist: 'אמן לבדיקה', genre: 'בדיקה' }).map(r => r.id), ['b', 'a']);
  assert.deepEqual(selectRows(rows, { sort: 'popularity', direction: 'desc' }).map(r => r.id), ['c', 'b', 'a']);
  assert.deepEqual(selectRows(rows, { sort: 'popularity', direction: 'asc' }).map(r => r.id), ['b', 'c', 'a']);
  assert.equal(selectRows(rows, { genre: 'missing' }).length, 0);
  assert.equal(rows[0].id, 'a');
});
test('schema rejects invalid dates, out-of-year data and unsafe source URLs', () => {
  for (const date of ['2026-02-30', '2025-01-01']) { const data = fixture(); data.songs[0].releaseDate = date; assert.ok(validateCatalog(data).length); }
  const data = fixture(); data.songs[0].sources[0].url = 'javascript:alert(1)'; assert.ok(validateCatalog(data).length);
});
test('integrity rejects duplicate recordings, dangling releases and unqualified artists', () => {
  const data = fixture(); data.songs.push(structuredClone(data.songs[0]));
  assert.ok(validateCatalog(data).some(e => e.includes('Duplicate song')));
  const dangling = fixture(); dangling.songs[0].releaseIds = ['missing'];
  assert.ok(validateCatalog(dangling).some(e => e.includes('unknown release')));
  const artist = fixture(); artist.songs[0].eligibility.artist = 'not a primary artist';
  assert.ok(validateCatalog(artist).some(e => e.includes('primary artist')));
});

test('EP appears with albums and its songs remain searchable by release title', () => {
  const data = fixture(); data.releases[1].type = 'ep'; data.releases[1].title = 'מיני אלבום';
  assert.deepEqual(validateCatalog(data), []);
  assert.equal(rowsFor(data, 'album')[0].type, 'ep');
  assert.equal(rowsFor(data, 'single').length, 1);
  assert.equal(selectRows(rowsFor(data, 'songs'), { query: 'מיני אלבום' }).length, 1);
});
