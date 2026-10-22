import { h } from './dom.js';
import { NEBULA_SUMMARIES } from '../data/nebulae.js';
import { PHANGS_COLUMNS, formatCell, missing, normalizeColumnFilters, normalizeTableSort,
  matchesPhangsSelection, phangsTableContext, sortPhangsRows } from '../data/phangs-table.js';

export function initPhangsTable(app, ui) {
  const { store, events } = app;
  const stage = app.layers.stage;
  const switchMount = h('div', { class: 'phangs-view-switch', role: 'group', 'aria-label': 'PHANGS result presentation' });
  const plotButton = h('button', { type: 'button', text: 'Plot', onclick: () => setView('plot') });
  const tableButton = h('button', { type: 'button', text: 'Table', onclick: () => setView('table') });
  switchMount.append(plotButton, tableButton);
  const status = h('p', { class: 'phangs-table-status', role: 'status', 'aria-live': 'polite' });
  const method = h('select', { 'aria-label': 'Table MUSE galaxy summary', onchange: () => store.set({ phangs: { nebulaSummary: method.value } }) },
    ...Object.entries(NEBULA_SUMMARIES).map(([value, text]) => h('option', { value, text })));
  const filterStrip = h('div', { class: 'phangs-active-filters', hidden: true, 'aria-label': 'Active PHANGS column filters' });
  const scroll = h('div', { class: 'phangs-table-scroll', tabindex: '0', role: 'region', 'aria-label': 'Galaxy results; scroll horizontally for more properties' });
  const table = h('table', { class: 'phangs-table' });
  const caption = h('caption', { class: 'sr-only', text: 'Selected PHANGS galaxies. Column filters also apply to the plot. Missing values are shown as a dash.' });
  const groupRow = h('tr'), headerRow = h('tr'), body = h('tbody');
  const head = h('thead', {}, groupRow, headerRow);
  table.append(caption, head, body);
  scroll.append(table);
  const empty = h('p', { class: 'phangs-table-empty', hidden: true });
  const copy = h('button', { type: 'button', class: 'table-copy-link', text: 'Copy link', onclick: async () => {
    copy.textContent = await ui.url?.copyLink() ? 'Link copied' : 'Copy failed';
  } });
  const toolbar = h('div', { class: 'phangs-table-toolbar' },
    h('div', {}, h('h2', { text: 'Selected galaxies' }), status),
    h('div', { class: 'table-toolbar-actions' }, h('label', {}, h('span', { text: 'MUSE summary' }), method), copy));
  const root = h('section', { class: 'phangs-table-panel', hidden: true, 'aria-label': 'PHANGS galaxy results' }, toolbar, scroll, empty);
  stage.append(root, filterStrip);
  const dialog = h('dialog', { class: 'phangs-table-dialog', 'aria-labelledby': 'phangs-table-dialog-title' });
  document.body.append(dialog);
  let catalogue = null, failed = false, ready = false, dirty = true;
  let filterTitle = '', plotted = null, renderFrame = 0;
  const position = { x: 0, y: 0 };
  scroll.addEventListener('scroll', () => { if (!root.hidden) { position.x = scroll.scrollLeft; position.y = scroll.scrollTop; } });
  const headers = new Map();
  for (const group of [...new Set(PHANGS_COLUMNS.map(c => c.group))]) {
    const columns = PHANGS_COLUMNS.filter(c => c.group === group);
    groupRow.append(h('th', { scope: 'colgroup', colspan: columns.length, text: group }));
    for (const col of columns) {
      const sort = h('button', { type: 'button', class: 'table-sort', text: col.label,
        'aria-label': `Sort by ${col.label}${col.unit ? ` (${col.unit})` : ''}`, onclick: () => {
          const current = normalizeTableSort(store.get().tableSort);
          store.set({ tableSort: { key: col.key, direction: current.key === col.key && current.direction === 'asc' ? 'desc' : 'asc' } });
        } });
      const filter = h('button', { type: 'button', class: 'table-filter', text: '⌄',
        'aria-label': `Filter ${col.label}${col.unit ? ` (${col.unit})` : ''}`, 'aria-haspopup': 'dialog', onclick: () => openFilter(col) });
      const th = h('th', { scope: 'col', 'data-column': col.key, 'aria-sort': 'none' },
        h('div', { class: 'table-heading' }, sort, filter), h('small', { text: col.unit || '\u00a0' }));
      headerRow.append(th);
      headers.set(col.key, { th, sort, filter });
    }
  }
  function setView(view) {
    ui.closeMenus();
    store.set({ presentation: view });
  }
  const filters = () => store.get().phangs?.columnFilters || [];
  function changeFilter(key, next) {
    const rest = filters().filter(f => f.key !== key);
    store.set({ phangs: { columnFilters: normalizeColumnFilters(next ? [...rest, next] : rest) } });
  }
  function dialogShell(title) {
    if (dialog.open) dialog.close();
    const close = h('button', { type: 'button', text: 'Close', onclick: () => dialog.close() });
    dialog.replaceChildren(h('div', { class: 'table-dialog-head' }, h('h2', { id: 'phangs-table-dialog-title', text: title }), close));
  }
  function openFilter(col) {
    ui.closeMenus();
    dialogShell(`Filter ${col.label}${col.unit ? ` (${col.unit})` : ''}`);
    const current = filters().find(f => f.key === col.key) || {};
    const presence = h('select', { 'aria-label': 'Value availability' },
      h('option', { value: 'any', text: 'Any availability' }), h('option', { value: 'present', text: 'Has value' }), h('option', { value: 'missing', text: 'Missing' }));
    presence.value = current.presence || 'any';
    const form = h('form', {}, h('label', {}, h('span', { text: 'Availability' }), presence));
    const constraints = h('fieldset', { class: 'table-filter-constraints' });
    let min, max, text;
    const choices = [];
    if (col.type === 'number') {
      min = h('input', { type: 'number', step: 'any', 'aria-label': 'Minimum (inclusive)', placeholder: 'No minimum', value: current.min });
      max = h('input', { type: 'number', step: 'any', 'aria-label': 'Maximum (inclusive)', placeholder: 'No maximum', value: current.max });
      constraints.append(h('label', {}, h('span', { text: 'Minimum (inclusive)' }), min), h('label', {}, h('span', { text: 'Maximum (inclusive)' }), max));
      const clearValidity = () => max.setCustomValidity('');
      min.addEventListener('input', clearValidity); max.addEventListener('input', clearValidity);
    } else if (col.type === 'text') {
      text = h('input', { type: 'search', 'aria-label': 'Contains text', placeholder: 'Contains…', value: current.text });
      constraints.append(h('label', {}, h('span', { text: 'Contains text (ignores case)' }), text));
    } else {
      constraints.append(h('legend', { text: 'Match any selected value (none = all)' }));
      const ctx = phangsTableContext(app);
      const values = [...new Set((catalogue?.galaxies || []).map(r => col.value(r, ctx)).filter(v => !missing(v)).map(String)), ...(current.values || [])];
      const allValues = [...new Set(values)].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
      for (const value of allValues) {
        const input = h('input', { type: 'checkbox', value, checked: current.values?.includes(value) });
        choices.push(input);
        constraints.append(h('label', { class: 'table-filter-choice' }, input, h('span', { text: formatCell(col, value) })));
      }
      if (!allValues.length) constraints.append(h('p', { text: 'No recorded values in this catalogue.' }));
    }
    const syncPresence = () => { constraints.disabled = presence.value === 'missing'; };
    presence.addEventListener('change', syncPresence); syncPresence();
    form.append(constraints, h('p', { class: 'table-filter-hint', text: 'Column filters also apply to the PHANGS plot. Other columns and observation filters must also match.' }),
      h('div', { class: 'table-dialog-actions' }, h('button', { type: 'button', text: 'Clear this filter', onclick: () => { changeFilter(col.key, null); dialog.close(); } }),
        h('button', { type: 'submit', text: 'Apply filter' })));
    form.addEventListener('submit', e => {
      e.preventDefault();
      const next = { key: col.key, presence: presence.value };
      if (presence.value !== 'missing') {
        if (min && min.value !== '') next.min = min.valueAsNumber;
        if (max && max.value !== '') next.max = max.valueAsNumber;
        if (min && max && Number.isFinite(next.min) && Number.isFinite(next.max) && next.min > next.max) {
          max.setCustomValidity('Maximum must be at least the minimum.'); max.reportValidity(); return;
        }
        if (text) next.text = text.value;
        if (choices.length) next.values = choices.filter(c => c.checked).map(c => c.value);
      }
      changeFilter(col.key, next); dialog.close();
    });
    dialog.append(form); dialog.showModal();
  }
  body.addEventListener('click', e => {
    const button = e.target.closest('button[data-galaxy]');
    if (!button) return;
    const row = catalogue?.galaxies.find(r => r.name === button.dataset.galaxy);
    if (!row) return;
    if (button.dataset.column === 'name') {
      app.overlays?.phangs?.inspect(row);
      return;
    }
    const col = PHANGS_COLUMNS.find(c => c.key === button.dataset.column), ctx = phangsTableContext(app);
    dialogShell(`${row.name.toUpperCase()} · ${col.label}`);
    dialog.append(h('p', { text: `${formatCell(col, col.value(row, ctx))}${col.unit ? ` ${col.unit}` : ''}` }),
      h('p', { class: 'table-cell-provenance', text: `Stored value: ${col.value(row, ctx) ?? 'Unavailable'}\n${col.detail(row, ctx) || 'No additional provenance recorded.'}` }));
    dialog.showModal();
  });
  // Prevent Escape and plot shortcuts in the native modal from reaching the app.
  dialog.addEventListener('keydown', e => e.stopPropagation());
  function renderFilters() {
    const title = JSON.stringify(filters());
    if (title === filterTitle) return;
    filterTitle = title;
    filterStrip.hidden = !filters().length;
    const chips = filters().map(f => {
      const col = PHANGS_COLUMNS.find(c => c.key === f.key);
      const value = f.presence === 'missing' ? 'Missing' : [f.presence === 'present' ? 'Has value' : '',
        f.min != null ? `≥ ${f.min}` : '', f.max != null ? `≤ ${f.max}` : '', f.text, f.values?.map(v => formatCell(col, v)).join(', ')].filter(Boolean).join(' · ');
      return h('button', { type: 'button', class: 'table-filter-chip', text: `${col.label}: ${value}`, onclick: () => openFilter(col) });
    });
    filterStrip.replaceChildren(h('span', { text: 'PHANGS filters' }), ...chips,
      h('button', { type: 'button', text: 'Clear column filters', onclick: () => store.set({ phangs: { columnFilters: [] } }) }));
  }
  function updateStatus(count) {
    const nebulae = app.overlays?.phangs?.nebulae;
    const museStatus = nebulae?.summaryError || (!nebulae?.catalogue ? 'Loading MUSE summaries…' : '');
    method.disabled = !nebulae?.catalogue;
    method.value = store.get().phangs?.nebulaSummary || 'mean';
    status.textContent = !ready ? 'Loading PHANGS catalogue…' : failed ? 'PHANGS catalogue unavailable. Reload to retry.' :
      `${count} / ${catalogue.galaxies.length} selected${plotted == null ? '' : ` · ${plotted} plotted in current view`}${museStatus ? ` · ${museStatus}` : ''}`;
  }
  function render() {
    if (root.hidden || !dirty || renderFrame) return;
    renderFrame = requestAnimationFrame(() => { renderFrame = 0; renderRows(); });
  }
  function renderRows() {
    if (root.hidden || !dirty) return;
    dirty = false;
    const ctx = phangsTableContext(app), state = store.get(), sort = normalizeTableSort(state.tableSort);
    const rows = sortPhangsRows((catalogue?.galaxies || []).filter(r => matchesPhangsSelection(r, state.phangs, ctx)), sort, ctx);
    updateStatus(rows.length);
    for (const col of PHANGS_COLUMNS) {
      const header = headers.get(col.key), active = sort.key === col.key;
      header.th.setAttribute('aria-sort', active ? sort.direction === 'asc' ? 'ascending' : 'descending' : 'none');
      header.sort.textContent = `${col.label}${active ? sort.direction === 'asc' ? ' ↑' : ' ↓' : ''}`;
      header.filter.classList.toggle('active', filters().some(f => f.key === col.key));
    }
    const { x, y } = position;
    body.replaceChildren(...rows.map(row => h('tr', {}, ...PHANGS_COLUMNS.map(col => {
      const value = col.value(row, ctx);
      const td = h(col.key === 'name' ? 'th' : 'td', { ...(col.key === 'name' ? { scope: 'row' } : {}), class: col.type === 'number' ? 'numeric' : '', title: formatCell(col, value) });
      const detail = col.key === 'name' || col.detail(row, ctx);
      td.append(detail ? h('button', { type: 'button', class: col.key === 'name' ? 'table-galaxy-name' : 'table-cell-detail',
        'data-galaxy': row.name, 'data-column': col.key, text: formatCell(col, value),
        'aria-label': col.key === 'name' ? `Inspect ${row.name.toUpperCase()}` : `${col.label}: ${formatCell(col, value)}${col.unit ? ` ${col.unit}` : ''}; details` }) : h('span', { text: formatCell(col, value) }));
      return td;
    }))));
    scroll.scrollLeft = x; scroll.scrollTop = y;
    empty.hidden = !!rows.length;
    empty.textContent = !ready ? 'Loading galaxies…' : failed ? 'Galaxy data unavailable.' : 'No galaxies match these filters. Clear column filters or adjust the observation selections.';
  }
  function sync() {
    const on = store.get().presentation === 'table';
    if (!root.hidden && !on) { position.x = scroll.scrollLeft; position.y = scroll.scrollTop; }
    root.hidden = !on;
    stage.setAttribute('aria-label', on ? 'PHANGS galaxy catalogue' : 'Projection of the PHANGS Galaxy Manifold');
    document.documentElement.classList.toggle('gm-table-mode', on);
    app.layers.stageUI.inert = on;
    document.getElementById('console').inert = on;
    plotButton.setAttribute('aria-pressed', String(!on)); tableButton.setAttribute('aria-pressed', String(on));
    if (on && filterStrip.parentNode !== root) root.insertBefore(filterStrip, scroll);
    if (!on && filterStrip.parentNode !== stage) stage.append(filterStrip);
    renderFilters(); render();
  }
  events.on('state', ({ changed }) => {
    if (!changed.some(k => ['phangs', 'tableSort', 'presentation'].includes(k))) return;
    dirty = true; sync();
  });
  events.on('phangs:ready', c => { catalogue = c; ready = true; failed = !c; dirty = true; sync(); });
  events.on('phangs:measurements', () => { dirty = true; sync(); });
  events.on('phangs:count', counts => {
    plotted = counts.visible;
    if (!root.hidden) updateStatus((catalogue?.galaxies || []).filter(r => matchesPhangsSelection(r, store.get().phangs, phangsTableContext(app))).length);
  });
  sync();
  return { switchMount, get dialogOpen() { return dialog.open; }, get open() { return !root.hidden; } };
}
