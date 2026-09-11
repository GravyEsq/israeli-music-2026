import { createHash } from 'node:crypto';
import { validateCatalog } from './validation.mjs';

export function parseLookup(payload, kind, id) {
  if (!payload || !Number.isInteger(payload.resultCount) || !Array.isArray(payload.results) || payload.resultCount !== payload.results.length) throw new Error(`Malformed Apple response for ${id}`);
  const anchor = payload.results.find(r => kind === 'artist' ? r.wrapperType === 'artist' && r.artistId === id : r.wrapperType === 'collection' && r.collectionId === id);
  if (!anchor) throw new Error(`Apple did not return requested ${kind} ${id}`);
  if (kind === 'artist' && payload.results.length >= 200) throw new Error(`Artist ${id} reached lookup limit; coverage needs review`);
  if (kind === 'album') {
    const tracks = payload.results.filter(r => r.wrapperType === 'track' && r.kind === 'song');
    if (!tracks.length || tracks.length !== anchor.trackCount || tracks.some(t => t.collectionId !== id)) throw new Error(`Incomplete tracklist for ${id}`);
  }
  return payload;
}

// Identity, date or tracklist changes require review; prices and artwork do not.
export function fingerprint(payload) {
  const keys = ['wrapperType', 'kind', 'collectionId', 'trackId', 'artistId', 'artistName', 'collectionName', 'trackName', 'releaseDate', 'trackTimeMillis', 'trackCount'];
  const normalized = payload.results.filter(r => ['collection', 'track'].includes(r.wrapperType))
    .map(row => Object.fromEntries(keys.filter(k => row[k] !== undefined).map(k => [k, row[k]])))
    .sort((a, b) => (a.trackId ?? 0) - (b.trackId ?? 0));
  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

export function discover(artistPayloads, reviews, now) {
  const approved = new Set(reviews.map(r => r.collectionId));
  const found = new Map();
  for (const payload of artistPayloads) for (const row of payload.results) {
    if (row.wrapperType !== 'collection' || typeof row.releaseDate !== 'string' || !row.releaseDate.startsWith('2026-') || row.releaseDate.slice(0, 10) > now.slice(0, 10) || approved.has(row.collectionId)) continue;
    found.set(row.collectionId, { collectionId: row.collectionId, title: row.collectionName, providerArtist: row.artistName, releaseDate: row.releaseDate.slice(0, 10), url: `https://music.apple.com/il/album/${row.collectionId}`, reason: 'needs-language-primary-artist-and-recording-review' });
  }
  return [...found.values()].sort((a, b) => a.collectionId - b.collectionId);
}

export function buildCatalog(previous, reviews, roster, payloads, now) {
  const errors = validateCatalog(previous);
  if (errors.length) throw new Error(`Existing catalog invalid: ${errors.join('; ')}`);
  const releaseMap = new Map(previous.releases.map(r => [r.id, structuredClone(r)]));
  const songMap = new Map(previous.songs.map(r => [r.id, structuredClone(r)]));
  const pending = [], seenReviews = new Set();
  for (const review of reviews) {
    if (seenReviews.has(review.collectionId)) throw new Error(`Duplicate approval ${review.collectionId}`);
    seenReviews.add(review.collectionId);
    const payload = parseLookup(payloads.get(review.collectionId), 'album', review.collectionId);
    if (fingerprint(payload) !== review.fingerprint) {
      pending.push({ collectionId: review.collectionId, title: review.title, reason: 'provider-metadata-changed', url: `https://music.apple.com/il/album/${review.collectionId}` }); continue;
    }
    const artist = roster.find(a => a.id === review.qualifyingArtist);
    if (!artist || !review.artists.includes(artist.name) || artist.eligibility.monthlyListeners < 50000 || !artist.eligibility.isIsraeli) throw new Error(`Invalid qualifying artist: ${review.collectionId}`);
    if (review.releaseDate > now.slice(0, 10) || review.reviewedAt > now) throw new Error(`Future review or release: ${review.collectionId}`);
    const releaseId = `apple-release-${review.collectionId}`;
    if (!releaseMap.has(releaseId) && Date.parse(now) - Date.parse(artist.eligibility.source.checkedAt) > 30 * 86400000) {
      pending.push({ collectionId: review.collectionId, title: review.title, reason: 'eligibility-observation-expired' }); continue;
    }
    const source = { label: 'Apple Music', url: `https://music.apple.com/il/album/${review.collectionId}`, checkedAt: review.reviewedAt };
    const shared = { language: 'he', genres: review.genres, popularity: null, eligibility: artist.eligibility };
    const release = { id: releaseId, type: review.type, title: review.title, artists: review.artists, releaseDate: review.releaseDate, ...shared, sources: [source, ...review.sources] };
    const collection = payload.results.find(r => r.wrapperType === 'collection');
    if (collection.releaseDate.slice(0, 10) !== release.releaseDate) throw new Error(`Unverified release date ${releaseId}`);
    const trackIds = new Set();
    for (const approval of review.tracks) {
      if (trackIds.has(approval.trackId)) throw new Error(`Duplicate track approval: ${approval.trackId}`);
      trackIds.add(approval.trackId);
      const track = payload.results.find(r => r.trackId === approval.trackId);
      if (!track || !approval.artists.includes(artist.name) || !approval.languageSource) throw new Error(`Invalid track approval ${approval.trackId}`);
      const date = approval.firstReleaseDate;
      if (date > release.releaseDate || date > now.slice(0, 10)) throw new Error(`Invalid first release date ${approval.trackId}`);
      // Explicit recording IDs connect appearances. Never merge by title alone.
      const song = { id: approval.recordingId, title: approval.title, artists: approval.artists, releaseDate: date, releaseIds: [releaseId], isrc: approval.isrc ?? null, ...shared,
        sources: [{ label: 'Apple Music', url: `https://music.apple.com/il/album/${review.collectionId}?i=${approval.trackId}`, checkedAt: review.reviewedAt }, approval.languageSource] };
      const existing = songMap.get(song.id);
      if (existing) {
        if (existing.title !== song.title || JSON.stringify(existing.artists) !== JSON.stringify(song.artists) || existing.isrc !== song.isrc) throw new Error(`Conflicting recording identity: ${song.id}`);
        song.releaseIds = [...new Set([...existing.releaseIds, releaseId])].sort();
        song.releaseDate = existing.releaseDate < date ? existing.releaseDate : date;
        song.sources = [...new Map([...existing.sources, ...song.sources].map(s => [s.url, s])).values()];
        song.popularity = existing.popularity;
      }
      songMap.set(song.id, song);
    }
    if (!review.tracks.length) throw new Error(`No approved songs in ${releaseId}`);
    releaseMap.set(releaseId, release);
  }
  const byId = (a, b) => a.id.localeCompare(b.id);
  const catalog = { ...previous, releases: [...releaseMap.values()].sort(byId), songs: [...songMap.values()].sort(byId) };
  const changed = JSON.stringify(catalog.releases) !== JSON.stringify(previous.releases) || JSON.stringify(catalog.songs) !== JSON.stringify(previous.songs);
  if (changed) catalog.updatedAt = now;
  const invalid = validateCatalog(catalog);
  if (invalid.length) throw new Error(invalid.join('; '));
  return { catalog, pending, changed };
}
