import { readFileSync } from 'node:fs';
import { validateCatalog } from './validation.mjs';

try {
  const data = JSON.parse(readFileSync(new URL('../public/data/releases.json', import.meta.url), 'utf8'));
  const errors = validateCatalog(data);
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(`Catalog valid: ${data.releases.length} releases, ${data.songs.length} songs.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
