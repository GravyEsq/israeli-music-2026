const collator = new Intl.Collator('he', { numeric: true, sensitivity: 'base' });

export function rowsFor(data, kind) {
  if (kind !== 'songs') return data.releases.filter(row => row.type === kind);
  const releases = new Map(data.releases.map(row => [row.id, row]));
  return data.songs.map(song => ({ ...song,
    albums: song.releaseIds.map(id => releases.get(id)).filter(row => row?.type === 'album').map(row => row.title)
  }));
}

export function selectRows(rows, { query = '', artist = '', genre = '', sort = 'releaseDate', direction = 'desc' } = {}) {
  const term = query.trim().toLocaleLowerCase('he');
  const filtered = rows.filter(row =>
    (!term || [row.title, ...row.artists, ...row.genres, ...(row.albums ?? [])].join(' ').toLocaleLowerCase('he').includes(term)) &&
    (!artist || row.artists.includes(artist)) && (!genre || row.genres.includes(genre)));
  const value = row => sort === 'popularity' ? row.popularity?.score ?? null : Array.isArray(row[sort]) ? row[sort].join(', ') : row[sort];
  return filtered.sort((a, b) => {
    const av = value(a), bv = value(b);
    // Unknown values always appear last, including when sorting descending.
    if (av == null && bv != null) return 1;
    if (bv == null && av != null) return -1;
    const order = av == null ? 0 : typeof av === 'number' ? av - bv : collator.compare(av, bv);
    return order * (direction === 'asc' ? 1 : -1) || collator.compare(a.id, b.id);
  });
}

export function optionsFor(rows, key) {
  return [...new Set(rows.flatMap(row => row[key]))].sort(collator.compare);
}
