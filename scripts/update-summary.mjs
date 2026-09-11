import { readFileSync } from 'node:fs';
const read = p => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const status = read('../public/data/status.json'), catalog = read('../public/data/releases.json');
console.log(`Daily discovery: ${status.state}.\n\nPublished: ${catalog.releases.length} releases / ${catalog.songs.length} recordings.\n\nAwaiting editorial review: ${status.pendingCount ?? 'unknown'}. New candidates are not automatically asserted to be Hebrew or unique recordings.\n\n[Review queue](https://github.com/GravyEsq/israeli-music-2026/blob/main/data/pending-review.json)`);
