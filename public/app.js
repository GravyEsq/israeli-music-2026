import { rowsFor, selectRows, optionsFor } from './lib/catalog.js';

const container = document.querySelector('#tables');
const status = document.querySelector('#status');
const retry = document.querySelector('#retry');
const dateFormat = new Intl.DateTimeFormat('he-IL', { timeZone: 'UTC' });
function el(tag, text, className) {
  const element = document.createElement(tag);
  if (text != null) element.textContent = text;
  if (className) element.className = className;
  return element;
}

function createTable(data, { id, kind, title, description }) {
  const rows = rowsFor(data, kind);
  const state = { sort: 'releaseDate', direction: 'desc', query: '', artist: '', genre: '' };
  const section = el('section'); section.id = id; section.setAttribute('aria-labelledby', `${id}-title`);
  const heading = el('div', null, 'section-heading');
  const h2 = el('h2', title); h2.id = `${id}-title`;
  const count = el('span', '', 'count'); count.setAttribute('aria-live', 'polite');
  heading.append(h2, count); section.append(heading, el('p', description, 'description'));
  const filters = el('form', null, 'filters'); filters.addEventListener('submit', e => e.preventDefault());
  const searchLabel = el('label', 'חיפוש');
  const search = el('input'); search.type = 'search'; search.placeholder = 'שם שיר, אמן או אלבום';
  search.addEventListener('input', () => { state.query = search.value; render(); });
  searchLabel.append(search); filters.append(searchLabel);
  for (const [key, label, all, field] of [['artist', 'אמן', 'כל האמנים', 'artists'], ['genre', 'ז׳אנר', 'כל הז׳אנרים', 'genres']]) {
    const wrapper = el('label', label), select = el('select');
    const first = el('option', all); first.value = ''; select.append(first);
    for (const value of optionsFor(rows, field)) { const option = el('option', value); option.value = value; select.append(option); }
    select.addEventListener('change', () => { state[key] = select.value; render(); }); wrapper.append(select); filters.append(wrapper);
  }
  const reset = el('button', 'ניקוי סינון', 'reset'); reset.type = 'button';
  reset.addEventListener('click', () => { filters.reset(); Object.assign(state, { query: '', artist: '', genre: '' }); render(); });
  filters.append(reset); section.append(filters);
  const scroll = el('div', null, 'table-scroll'); scroll.tabIndex = 0; scroll.setAttribute('role', 'region'); scroll.setAttribute('aria-label', `טבלת ${title}`);
  const table = el('table'); const caption = el('caption', `${title} — לחצו על כותרת עמודה למיון`, 'sr-only'); table.append(caption);
  const thead = el('thead'), header = el('tr'), tbody = el('tbody');
  const columns = [['title', kind === 'album' ? 'אלבום' : 'שם'], ['artists', 'אמן'], ['releaseDate', 'תאריך יציאה'], ['genres', 'ז׳אנר'], ...(kind === 'songs' ? [['albums', 'אלבום']] : []), ['popularity', 'פופולריות']];
  const headers = [];
  for (const [key, label] of columns) {
    const th = el('th'); th.scope = 'col'; const button = el('button'); button.type = 'button';
    button.addEventListener('click', () => { state.direction = state.sort === key && state.direction === 'asc' ? 'desc' : 'asc'; state.sort = key; render(); });
    th.append(button); header.append(th); headers.push({ th, button, key, label });
  }
  const sourceHeader = el('th', 'מקורות'); sourceHeader.scope = 'col'; header.append(sourceHeader);
  thead.append(header); table.append(thead, tbody); scroll.append(table); section.append(scroll);
  function render() {
    const visible = selectRows(rows, state); count.textContent = `${visible.length} מתוך ${rows.length}`;
    for (const { th, button, key, label } of headers) {
      const active = state.sort === key;
      th.setAttribute('aria-sort', active ? state.direction === 'asc' ? 'ascending' : 'descending' : 'none');
      button.textContent = `${label} ${active ? state.direction === 'asc' ? '↑' : '↓' : '↕'}`;
    }
    tbody.replaceChildren();
    if (!visible.length) {
      const tr = el('tr'), td = el('td', rows.length ? 'לא נמצאו תוצאות. נסו לשנות או לנקות את הסינון.' : 'עדיין אין רשומות מאומתות במאגר.', 'empty');
      td.colSpan = columns.length + 1; tr.append(td); tbody.append(tr); return;
    }
    for (const row of visible) {
      const tr = el('tr');
      for (const [key] of columns) {
        let value = row[key];
        if (key === 'releaseDate') value = dateFormat.format(new Date(`${value}T00:00:00Z`));
        else if (key === 'popularity') value = value == null ? '—' : `${value.score}/100`;
        else if (Array.isArray(value)) value = value.join(' · ') || '—';
        const td = el('td', value); td.dir = 'auto';
        if (key === 'popularity') td.title = row.popularity?.method ?? 'טרם נמדד';
        tr.append(td);
      }
      const sources = el('td');
      for (const source of row.sources) {
        const url = new URL(source.url);
        if (url.protocol !== 'https:') continue;
        const a = el('a', source.label); a.href = url.href; a.target = '_blank'; a.rel = 'noopener noreferrer'; sources.append(a, document.createTextNode(' '));
      }
      tr.append(sources); tbody.append(tr);
    }
  }
  render(); return section;
}

async function load() {
  retry.hidden = true; status.textContent = 'טוען את המאגר…'; container.replaceChildren();
  try {
    const response = await fetch('./data/releases.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (data.schemaVersion !== 1 || data.year !== 2026 || !Array.isArray(data.releases) || !Array.isArray(data.songs)) throw new Error('Unsupported catalog');
    const sections = [
      { id: 'singles', kind: 'single', title: 'סינגלים', description: 'שירים שיצאו כריליס עצמאי.' },
      { id: 'albums', kind: 'album', title: 'אלבומים', description: 'אלבומים שיצאו במהלך השנה.' },
      { id: 'songs', kind: 'songs', title: 'כל השירים', description: 'סינגלים ורצועות אלבום, עם רשומה אחת לכל הקלטה.' }
    ].map(config => createTable(data, config));
    container.replaceChildren(...sections);
    status.textContent = data.updatedAt ? `עדכון נתונים אחרון: ${new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem' }).format(new Date(data.updatedAt))}` : 'המאגר מוכן לאיסוף. נתוני ריליסים יופיעו כאן לאחר אימות.';
    try {
      const checkResponse = await fetch('./data/status.json', { cache: 'no-cache' });
      if (!checkResponse.ok) throw new Error('Check status unavailable');
      const check = await checkResponse.json();
      const checkedAt = check.lastSuccess ? new Intl.DateTimeFormat('he-IL', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Jerusalem' }).format(new Date(check.lastSuccess)) : 'טרם הושלמה';
      const stale = !check.lastSuccess || Date.now() - Date.parse(check.lastSuccess) > 48 * 3600000;
      status.textContent += ` · בדיקה מוצלחת אחרונה: ${checkedAt} · ${check.pendingCount ?? 0} ריליסים ממתינים לבדיקה.`;
      if (check.state === 'failed') status.textContent += ' הבדיקה האחרונה נכשלה; מוצגים הנתונים המאומתים האחרונים.';
      else if (stale) status.textContent += ' לא הושלמה בדיקה ביומיים האחרונים.';
      if (check.expiredArtists?.length) status.textContent += ' נדרש רענון של נתוני הזכאות לאמנים.';
      document.querySelector('#coverage').textContent = `כיסוי ראשוני: ${check.artists.join(', ')}. זו עדיין אינה רשימה מלאה של ריליסי 2026.`;
    } catch { status.textContent += ' · מצב הבדיקה היומית אינו זמין.'; }
  } catch (error) {
    status.textContent = 'לא ניתן לטעון את המאגר. נסו שוב בעוד רגע.'; retry.hidden = false; console.error(error);
  }
}
retry.addEventListener('click', load);
load();
