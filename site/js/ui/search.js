// The header field refines the shared PHANGS sample in both presentation modes.
import { h } from './dom.js';
import { matchesPhangsSelection, phangsTableContext } from '../data/phangs-table.js';
export { normalizeGalaxyName, searchGalaxyNames } from '../data/galaxy-names.js';

export function galaxySearchStatus(app, row) {
  const filtered = !matchesPhangsSelection(row, app.store.get().phangs, phangsTableContext(app));
  const point = app.overlays?.phangs?.project(row);
  const axesLoading = !app.data.loaded;
  const unsupported = !point || !Number.isFinite(point.X) || !Number.isFinite(point.Y) || point.vis < 0.01;
  const notes = [];
  if (filtered) notes.push(app.store.get().phangs?.columnFilters?.length || app.store.get().phangs?.nameQuery ? 'Hidden by PHANGS filters' : 'Hidden by observation filters');
  if (axesLoading) notes.push('Loading plot axes');
  else if (unsupported) notes.push('Unavailable on current axes');
  else if (point.vis < 0.999) notes.push('Faded: some axis measurements missing');
  return { point, canPan: !filtered && !axesLoading && !unsupported, text: notes.join(' · ') || 'Available in this view' };
}

export function initGalaxySearch(app, mount, ui) {
  const input = h('input', { class: 'galaxy-search-input', type: 'search',
    placeholder: 'Filter name or alias…', 'aria-label': 'Filter PHANGS galaxies by name or alias',
    autocomplete: 'off', spellcheck: 'false' });
  const root = h('div', { class: 'galaxy-search' }, input);
  mount.append(root);
  input.addEventListener('input', () => {
    app.store.set({ phangs: { nameQuery: input.value.trim() } });
  });
  function sync() {
    const query = app.store.get().phangs?.nameQuery || '';
    if (input.value.trim() !== query) input.value = query;
  }
  app.events.on('state', ({ changed }) => { if (changed.includes('phangs')) sync(); });
  sync();
  return { input, root, close: () => false, focus: () => { ui.closeMenus(); input.focus(); } };
}
