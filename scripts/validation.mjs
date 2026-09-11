import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { readFileSync } from 'node:fs';

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);
const schema = JSON.parse(readFileSync(new URL('../public/data/releases.schema.json', import.meta.url), 'utf8'));
const validate = ajv.compile(schema);

export function validateCatalog(data) {
  if (!validate(data)) return validate.errors.map(e => `${e.instancePath || '/'}: ${e.message}`);
  const errors = [];
  const releases = new Map();
  const songIds = new Set(), isrcs = new Set(), linked = new Set();
  for (const release of data.releases) {
    if (releases.has(release.id)) errors.push(`Duplicate release id: ${release.id}`);
    releases.set(release.id, release);
  }
  for (const row of [...data.releases, ...data.songs]) {
    if (!row.artists.includes(row.eligibility.artist)) errors.push(`${row.id}: qualifying artist must be a primary artist`);
  }
  for (const song of data.songs) {
    if (songIds.has(song.id)) errors.push(`Duplicate song id: ${song.id}`);
    songIds.add(song.id);
    if (song.isrc && isrcs.has(song.isrc)) errors.push(`Duplicate ISRC: ${song.isrc}`);
    if (song.isrc) isrcs.add(song.isrc);
    for (const id of song.releaseIds) {
      const release = releases.get(id);
      if (!release) errors.push(`${song.id}: unknown release ${id}`);
      else if (song.releaseDate > release.releaseDate) errors.push(`${song.id}: first release date is after release ${id}`);
      linked.add(id);
    }
  }
  for (const id of releases.keys()) if (!linked.has(id)) errors.push(`${id}: release has no linked songs`);
  if ((data.releases.length || data.songs.length) && data.updatedAt === null) errors.push('Nonempty catalog requires updatedAt');
  return errors;
}
