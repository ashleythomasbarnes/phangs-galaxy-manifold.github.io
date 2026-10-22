// Name search belongs to the independent PHANGS catalogue, never the SDSS row mask.
import { h, floatLayer, reducedMotion } from './dom.js';
import { matchesPhangsSelection, phangsTableContext } from '../data/phangs-table.js';

export function normalizeGalaxyName(name) {
  return String(name || '').toLowerCase().replace(/\d+/g, n => n.replace(/^0+(?=\d)/, '')).replace(/[^a-z0-9]/g, '');
}

/** Search canonical names and the catalogue's semicolon-separated aliases. */
export function searchGalaxyNames(rows, query) {
  const q = normalizeGalaxyName(query);
  if (!q) return [];
  return rows.flatMap(row => {
    const names = [row.name, ...(row.source?.alias || '').split(';')].filter(Boolean);
    let best = null;
    for (let i = 0; i < names.length; i++) {
      const name = normalizeGalaxyName(names[i]);
      if (!name.includes(q)) continue;
      const rank = (name === q ? 0 : name.startsWith(q) ? 2 : 4) + (i ? 1 : 0);
      if (!best || rank < best.rank) best = { row, alias: i ? names[i] : null, rank };
    }
    return best ? [best] : [];
  }).sort((a, b) => a.rank - b.rank || a.row.name.localeCompare(b.row.name));
}

export function galaxySearchStatus(app, row) {
  const filtered = !matchesPhangsSelection(row, app.store.get().phangs, phangsTableContext(app));
  const point = app.overlays?.phangs?.project(row);
  const axesLoading = !app.data.loaded;
  const unsupported = !point || !Number.isFinite(point.X) || !Number.isFinite(point.Y) || point.vis < 0.01;
  const notes = [];
  if (filtered) notes.push(app.store.get().phangs?.columnFilters?.length ? 'Hidden by PHANGS filters' : 'Hidden by observation filters');
  if (axesLoading) notes.push('Loading plot axes');
  else if (unsupported) notes.push('Unavailable on current axes');
  else if (point.vis < 0.999) notes.push('Faded: some axis measurements missing');
  return { point, canPan: !filtered && !axesLoading && !unsupported, text: notes.join(' · ') || 'Available in this view' };
}

/** Append one compact search field; callers include close() in ui.closeMenus(). */
export function initGalaxySearch(app, mount, ui) {
  const input = h('input', {
    class: 'galaxy-search-input', type: 'search', placeholder: 'Search galaxy…',
    'aria-label': 'Search PHANGS galaxies by name', role: 'combobox',
    'aria-autocomplete': 'list', 'aria-expanded': 'false',
    'aria-controls': 'galaxy-search-results', autocomplete: 'off', spellcheck: 'false',
  });
  const root = h('div', { class: 'galaxy-search' }, input);
  const list = h('div', { id: 'galaxy-search-results', role: 'listbox', 'aria-label': 'Matching PHANGS galaxies' });
  const status = h('p', { class: 'galaxy-search-status', role: 'status', 'aria-live': 'polite' });
  const panel = h('section', { class: 'galaxy-search-panel', hidden: true, 'aria-label': 'PHANGS galaxy search' },
    h('small', { class: 'galaxy-search-heading', text: 'PHANGS galaxies' }), status, list);
  mount.append(root);
  floatLayer().append(panel);
  let catalogue = app.overlays?.phangs?.catalogue || null;
  let loaded = !!catalogue, matches = [], active = -1, options = [];

  function place() {
    if (panel.hidden) return;
    const r = input.getBoundingClientRect();
    panel.style.left = `${Math.max(10, Math.min(r.left, window.innerWidth - panel.offsetWidth - 10))}px`;
    panel.style.top = `${r.bottom + 9}px`;
    panel.style.maxHeight = `${Math.max(100, window.innerHeight - r.bottom - 20)}px`;
  }

  function close() {
    if (panel.hidden) return false;
    panel.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    active = -1;
    return true;
  }

  function select(row) {
    const state = galaxySearchStatus(app, row);
    app.actions.setOverlay('phangs', true);
    app.overlays?.phangs?.inspect(row);
    if (state.canPan && app.store.get().presentation !== 'table') app.camera.set({ cx: state.point.X, cy: state.point.Y }, { duration: reducedMotion() ? 0 : 380 });
    input.value = row.name.toUpperCase();
    close();
    input.blur();
  }

  function activate(index) {
    active = index;
    options.forEach((option, i) => option.setAttribute('aria-selected', String(i === active)));
    if (active < 0) input.removeAttribute('aria-activedescendant');
    else {
      input.setAttribute('aria-activedescendant', options[active].id);
      options[active].scrollIntoView?.({ block: 'nearest' });
    }
  }

  function render() {
    matches = searchGalaxyNames(catalogue?.galaxies || [], input.value);
    list.replaceChildren();
    options = matches.slice(0, 8).map(({ row, alias }, i) => {
      const state = galaxySearchStatus(app, row);
      const option = h('button', {
        type: 'button', class: 'galaxy-search-result', id: `galaxy-search-result-${i}`,
        role: 'option', tabindex: '-1', 'aria-selected': 'false',
      }, h('b', { text: row.name.toUpperCase() }),
      alias ? h('span', { class: 'galaxy-search-alias', text: `Also ${alias.toUpperCase()}` }) : null,
      h('small', { text: state.text }));
      // Keep keyboard focus in the combobox while pointer users select an option.
      option.addEventListener('pointerdown', e => e.preventDefault());
      option.addEventListener('click', () => select(row));
      list.append(option);
      return option;
    });
    status.textContent = !loaded ? 'Loading PHANGS catalogue…' : !catalogue ? 'PHANGS catalogue unavailable.' :
      !normalizeGalaxyName(input.value) ? 'Search a name or alias, e.g. NGC 628.' :
      !matches.length ? 'No matching PHANGS galaxies.' : matches.length > 8 ? `Showing 8 of ${matches.length} matches. Keep typing to narrow the list.` :
      `${matches.length} matching ${matches.length === 1 ? 'galaxy' : 'galaxies'}`;
    activate(-1);
    place();
  }

  function show() {
    if (panel.hidden) {
      ui.closeMenus?.();
      panel.hidden = false;
      input.setAttribute('aria-expanded', 'true');
    }
    render();
  }
  input.addEventListener('focus', show);
  input.addEventListener('input', show);
  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (close()) { e.preventDefault(); e.stopPropagation(); }
      input.blur();
    } else if (e.key === 'Tab') close();
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (panel.hidden) show();
      if (options.length) activate((active + (e.key === 'ArrowDown' ? 1 : active < 0 ? 0 : -1) + options.length) % options.length);
    } else if (e.key === 'Enter' && !panel.hidden && matches.length) {
      e.preventDefault();
      select(matches[active < 0 ? 0 : active].row);
    }
  });
  document.addEventListener('pointerdown', e => {
    if (!root.contains(e.target) && !panel.contains(e.target)) close();
  });
  window.addEventListener('resize', place);
  app.events.on('phangs:ready', value => { catalogue = value; loaded = true; if (!panel.hidden) render(); });
  for (const event of ['state', 'settle', 'data:ready', 'phangs:measurements']) {
    app.events.on(event, () => { if (!panel.hidden) render(); });
  }
  // Also handle initialisation after a completed (including failed) catalogue request.
  app.overlays?.phangs?.ready?.then(value => {
    catalogue = value; loaded = true;
    if (!panel.hidden) render();
  });
  return { close, input, root };
}
