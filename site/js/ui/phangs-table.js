import { h } from './dom.js';
import { createPopover } from './popover.js';
import { icon } from './icons.js';
import { NEBULA_SUMMARIES } from '../data/nebulae.js';
import { PHANGS_SURVEYS, ALMA_PROGRAMS, ALMA_ARRAYS } from '../data/surveys.js';
import { PHANGS_COLUMNS, TABLE_PRESETS, formatCell, missing, normalizeColumnFilters, normalizeTableSort,
  normalizeTablePreset, normalizeVisibleColumns, visibleTableColumns, needsMuseMethod, clearPhangsFilters,
  matchesPhangsSelection, phangsTableContext, sortPhangsRows } from '../data/phangs-table.js';

export function initPhangsTable(app, ui) {
  const { store, events } = app, stage = app.layers.stage;
  const button = (text, onclick, props = {}) => h('button', { type: 'button', text, onclick, ...props });
  const switchMount = h('div', { class: 'phangs-view-switch', role: 'group', 'aria-label': 'PHANGS result presentation' });
  const tableButton = button('Table', () => setView('table'));
  const plotButton = button('Plot', () => setView('plot'));
  switchMount.append(tableButton, plotButton);
  ui.header.viewMount.append(switchMount);
  const status = h('span', { class: 'phangs-table-status', role: 'status', 'aria-live': 'polite' });
  const filtersButton = button('Filters', e => openPicker(e.currentTarget), { class: 'table-tool-button' });
  const columnsButton = button('Columns', e => openColumns(e.currentTarget), { class: 'table-tool-button' });
  const copy = button('Copy link', async () => { copy.textContent = await ui.url?.copyLink() ? 'Link copied' : 'Copy failed'; }, { class: 'table-tool-button table-copy-link' });
  const toolbar = h('div', { class: 'phangs-table-toolbar' },
    h('div', { class: 'table-result-heading' }, h('h2', { text: 'PHANGS galaxies' }), status),
    h('div', { class: 'table-toolbar-actions' }, filtersButton, columnsButton, copy));
  const tabs = h('div', { class: 'table-property-groups', role: 'group', 'aria-label': 'Property groups' });
  const groupButtons = new Map();
  for (const preset of TABLE_PRESETS) {
    const control = button(preset.label, () => { ui.closeMenus(); store.set({ tablePreset: preset.id }); });
    tabs.append(control); groupButtons.set(preset.id, control);
  }
  const method = h('select', { 'aria-label': 'Table MUSE galaxy summary', onchange: () => store.set({ phangs: { nebulaSummary: method.value } }) },
    ...Object.entries(NEBULA_SUMMARIES).map(([value, text]) => h('option', { value, text })));
  const methodLabel = h('label', { class: 'table-muse-method', hidden: true }, h('span', { text: 'MUSE method' }), method);
  const methodNote = h('small', { class: 'table-method-note', role: 'status', hidden: true });
  const sortNote = h('div', { class: 'table-sort-note', hidden: true });
  const filterStrip = h('div', { class: 'phangs-active-filters', hidden: true, 'aria-label': 'Active PHANGS filters' });
  const scroll = h('div', { class: 'phangs-table-scroll', tabindex: '0', role: 'region', 'aria-label': 'Galaxy results; scroll horizontally for more properties' });
  const headerRow = h('tr'), body = h('tbody');
  const table = h('table', { class: 'phangs-table' },
    h('caption', { text: 'Selected PHANGS galaxies. Filters also apply to the plot. Missing measurements are shown as a dash.' }), h('thead', {}, headerRow), body);
  scroll.append(table);
  const empty = h('p', { class: 'phangs-table-empty', hidden: true });
  const root = h('section', { class: 'phangs-table-panel', hidden: true, 'aria-label': 'PHANGS galaxy results' }, toolbar,
    h('div', { class: 'table-group-bar' }, tabs, methodLabel), methodNote, sortNote, filterStrip, scroll, empty);
  const plotFilters = button('Filters', e => openPicker(e.currentTarget), { class: 'table-tool-button' });
  const plotStatus = h('small', { class: 'phangs-plot-status', role: 'status' });
  const plotTools = h('div', { class: 'phangs-plot-tools' }, plotFilters, plotStatus);
  stage.append(root, plotTools);
  const panel = h('section', { id: 'phangs-filter-panel', class: 'control-popover phangs-data-panel', role: 'dialog', 'aria-labelledby': 'phangs-data-panel-title' });
  const pop = createPopover(filtersButton, panel, { fallbackFocus: () => store.get().presentation === 'table' ? filtersButton : plotFilters });
  // Detailed provenance remains a modal; filtering and column choice are anchored panels.
  const dialog = h('dialog', { class: 'phangs-table-dialog', 'aria-labelledby': 'phangs-table-dialog-title' });
  document.body.append(dialog);
  dialog.addEventListener('keydown', e => e.stopPropagation());
  panel.addEventListener('keydown', e => e.stopPropagation());
  let catalogue = null, failed = false, ready = false, dirty = true, renderFrame = 0;
  let filterSignature = '', columnSignature = '', currentGroup = 'global';
  const positions = new Map(), position = () => positions.get(currentGroup) || { x: 0, y: 0 };
  const savePosition = () => positions.set(currentGroup, { x: scroll.scrollLeft, y: scroll.scrollTop });
  scroll.addEventListener('scroll', () => { if (!root.hidden) savePosition(); });
  const filters = () => store.get().phangs?.columnFilters || [];
  const column = key => PHANGS_COLUMNS.find(c => c.key === key);
  function setView(view) { ui.closeMenus(); store.set({ presentation: view }); }
  function changeFilter(key, next) {
    store.set({ phangs: { columnFilters: normalizeColumnFilters([...filters().filter(f => f.key !== key), ...(next ? [next] : [])]) } });
  }
  function closePanel(focus = true) { return pop.close(focus); }
  function openPanel(anchor, title, build) {
    ui.closeMenus();
    pop.setAnchor(anchor);
    panel.replaceChildren(h('div', { class: 'table-dialog-head' }, h('h2', { id: 'phangs-data-panel-title', text: title }),
      button('Close', () => closePanel())));
    build(); pop.show(); panel.querySelector('input:not(:disabled)')?.focus({ preventScroll: true });
  }
  function fieldMatches(col, query) { return `${col.label} ${col.key} ${col.group} ${col.unit}`.toLowerCase().includes(query.toLowerCase().trim()); }
  function openPicker(anchor) {
    openPanel(anchor, 'Filter galaxies', () => {
      const query = h('input', { type: 'search', placeholder: 'Find a property…', 'aria-label': 'Find a filter property' });
      const list = h('div', { class: 'table-property-list' });
      const render = () => {
        list.replaceChildren();
        for (const group of [...new Set(PHANGS_COLUMNS.map(c => c.group))]) {
          const cols = PHANGS_COLUMNS.filter(c => c.group === group && fieldMatches(c, query.value));
          if (!cols.length) continue;
          list.append(h('h3', { text: group }), ...cols.map(col => button(`${col.label}${col.unit ? ` (${col.unit})` : ''}${filters().some(f => f.key === col.key) ? ' · active' : ''}`,
            () => openFilter(col, anchor), { class: 'table-property-option' })));
        }
        if (!list.children.length) list.append(h('p', { text: 'No matching properties.' }));
      };
      query.addEventListener('input', render); panel.append(query, list); render();
    });
  }
  function openColumns(anchor) {
    openPanel(anchor, 'Choose columns', () => {
      const preset = normalizeTablePreset(store.get().tablePreset);
      const query = h('input', { type: 'search', placeholder: 'Find a column…', 'aria-label': 'Find a table column' });
      const list = h('div', { class: 'table-property-list' });
      const render = () => {
        const selected = visibleTableColumns(store.get()).map(c => c.key);
        list.replaceChildren();
        for (const group of [...new Set(PHANGS_COLUMNS.map(c => c.group))]) {
          const cols = PHANGS_COLUMNS.filter(c => c.group === group && fieldMatches(c, query.value));
          if (!cols.length) continue;
          list.append(h('h3', { text: group }));
          for (const col of cols) {
            const check = h('input', { type: 'checkbox', checked: selected.includes(col.key), disabled: col.key === 'name',
              onchange: () => {
                const keys = visibleTableColumns(store.get()).map(c => c.key);
                store.set({ tableColumns: { [preset]: normalizeVisibleColumns(check.checked ? [...keys, col.key] : keys.filter(k => k !== col.key), preset) } });
              } });
            list.append(h('label', { class: 'table-filter-choice' }, check, h('span', { text: `${col.label}${col.unit ? ` (${col.unit})` : ''}${col.key === 'name' ? ' · pinned' : ''}` })));
          }
        }
        if (!list.children.length) list.append(h('p', { text: 'No matching columns.' }));
      };
      query.addEventListener('input', render);
      panel.append(query, list, button('Reset this group', () => { store.set({ tableColumns: { [preset]: null } }); render(); }, { class: 'table-reset-columns' }));
      render();
    });
  }
  function openFilter(col, anchor) {
    openPanel(anchor, `Filter ${col.label}${col.unit ? ` (${col.unit})` : ''}`, () => {
      const current = filters().find(f => f.key === col.key) || {};
      const form = h('form'), constraints = h('fieldset', { class: 'table-filter-constraints' });
      let min, max, text;
      const choices = [];
      if (col.type === 'number') {
        min = h('input', { type: 'number', step: 'any', 'aria-label': 'Minimum (inclusive)', placeholder: 'No minimum', value: current.min });
        max = h('input', { type: 'number', step: 'any', 'aria-label': 'Maximum (inclusive)', placeholder: 'No maximum', value: current.max });
        constraints.append(h('label', {}, h('span', { text: 'Minimum' }), min), h('label', {}, h('span', { text: 'Maximum' }), max));
        for (const input of [min, max]) input.addEventListener('input', () => max.setCustomValidity(''));
      } else if (col.type === 'text') {
        text = h('input', { type: 'search', 'aria-label': 'Contains text', placeholder: 'Contains…', value: current.text });
        constraints.append(h('label', {}, h('span', { text: 'Contains text (ignores case)' }), text));
      } else {
        constraints.append(h('legend', { text: 'Match any selected value (none = all)' }));
        const ctx = phangsTableContext(app);
        const values = [...new Set([...(catalogue?.galaxies || []).map(r => col.value(r, ctx)).filter(v => !missing(v)).map(String), ...(current.values || [])])].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
        for (const value of values) {
          const input = h('input', { type: 'checkbox', value, checked: current.values?.includes(value) });
          choices.push(input); constraints.append(h('label', { class: 'table-filter-choice' }, input, h('span', { text: formatCell(col, value) })));
        }
        if (!values.length) constraints.append(h('p', { text: 'No recorded values in this catalogue.' }));
      }
      const presence = h('select', { 'aria-label': 'Value availability' }, h('option', { value: 'any', text: 'Any availability' }),
        h('option', { value: 'present', text: 'Has value' }), h('option', { value: 'missing', text: 'Missing' }));
      presence.value = current.presence || 'any';
      const syncPresence = () => { constraints.disabled = presence.value === 'missing'; };
      presence.addEventListener('change', syncPresence); syncPresence();
      form.append(constraints, h('details', { open: !!current.presence }, h('summary', { text: 'Availability' }), presence),
        h('p', { class: 'table-filter-hint', text: 'Filters apply to the table and plot. All active filters must match.' }),
        h('div', { class: 'table-dialog-actions' }, button('Clear this filter', () => { changeFilter(col.key, null); closePanel(); }), h('button', { type: 'submit', text: 'Apply filter' })));
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
        changeFilter(col.key, next); closePanel();
      });
      panel.append(form);
    });
  }
  body.addEventListener('click', e => {
    const control = e.target.closest('button[data-galaxy]');
    if (!control) return;
    const row = catalogue?.galaxies.find(r => r.name === control.dataset.galaxy);
    if (!row) return;
    if (control.dataset.column === 'name') { app.overlays?.phangs?.inspect(row); return; }
    const col = column(control.dataset.column), ctx = phangsTableContext(app);
    dialog.replaceChildren(h('div', { class: 'table-dialog-head' }, h('h2', { id: 'phangs-table-dialog-title', text: `${row.name.toUpperCase()} · ${col.label}` }), button('Close', () => dialog.close())),
      h('p', { text: `${formatCell(col, col.value(row, ctx))}${col.unit ? ` ${col.unit}` : ''}` }),
      h('p', { class: 'table-cell-provenance', text: `Stored value: ${col.value(row, ctx) ?? 'Unavailable'}\n${col.detail(row, ctx) || 'No additional provenance recorded.'}` }));
    dialog.showModal();
  });
  function renderFilters() {
    const state = store.get().phangs || {};
    const signature = JSON.stringify([state.nameQuery, state.columnFilters, state.surveys]);
    if (signature === filterSignature) return;
    filterSignature = signature;
    const chips = [];
    const chip = (label, edit, remove) => h('span', { class: 'table-filter-chip' }, button(label, edit, { class: 'filter-chip-edit' }),
      button('×', () => { remove(); (store.get().presentation === 'table' ? filtersButton : plotFilters).focus({ preventScroll: true }); }, { class: 'filter-chip-remove', 'aria-label': `Remove ${label}` }));
    if (state.nameQuery) chips.push(chip(`Name: ${state.nameQuery}`, () => ui.header.search.focus(), () => store.set({ phangs: { nameQuery: '' } })));
    for (const survey of PHANGS_SURVEYS) {
      const f = state.surveys?.[survey.id];
      if (!f) continue;
      const program = survey.id === 'alma' ? ALMA_PROGRAMS.find(p => p.id === f.program)?.label : '';
      const array = survey.id === 'alma' ? ALMA_ARRAYS.find(a => a.id === f.array)?.label : '';
      const label = [survey.label, program || 'Data available', f.array !== 'any' ? array : ''].filter(Boolean).join(' · ');
      chips.push(chip(label, () => ui.rail.openSurvey(survey.id), () => store.set({ phangs: { surveys: { [survey.id]: null } } })));
    }
    for (const f of filters()) {
      const col = column(f.key);
      const value = f.presence === 'missing' ? 'Missing' : [f.presence === 'present' && !(f.values?.length || f.min != null || f.max != null || f.text) ? 'Has value' : '',
        f.min != null ? `≥ ${formatCell(col, f.min)}` : '', f.max != null ? `≤ ${formatCell(col, f.max)}` : '', f.text, f.values?.map(v => formatCell(col, v)).join(', ')].filter(Boolean).join(' · ');
      const label = `${col.label}: ${value}`;
      chips.push(chip(label, e => openFilter(col, e.currentTarget), () => changeFilter(col.key, null)));
    }
    filterStrip.hidden = !chips.length;
    filterStrip.replaceChildren(...chips, button('Clear all', () => { store.set({ phangs: clearPhangsFilters() }); (store.get().presentation === 'table' ? filtersButton : plotFilters).focus({ preventScroll: true }); }, { class: 'table-clear-all' }));
    for (const control of [filtersButton, plotFilters]) control.textContent = `Filters${chips.length ? ` (${chips.length})` : ''}`;
  }
  function updateStatus(count) {
    status.textContent = !ready ? 'Loading…' : failed ? 'Catalogue unavailable. Reload to retry.' : `${count} of ${catalogue.galaxies.length}`;
    const state = store.get(), showMethod = needsMuseMethod(state), nebulae = app.overlays?.phangs?.nebulae;
    methodLabel.hidden = !showMethod;
    method.disabled = !nebulae?.catalogue;
    method.value = state.phangs?.nebulaSummary || 'mean';
    methodNote.textContent = showMethod ? nebulae?.summaryError || (!nebulae?.catalogue ? 'Loading MUSE summaries…' : '') : '';
    methodNote.hidden = !methodNote.textContent;
  }
  function renderHeaders(cols, sort) {
    const signature = cols.map(c => c.key).join(',');
    if (signature !== columnSignature) {
      columnSignature = signature;
      table.style.minWidth = `${136 + (cols.length - 1) * 118}px`;
      headerRow.replaceChildren(...cols.map(col => h('th', { scope: 'col', 'data-column': col.key },
        h('div', { class: 'table-heading' }, button(col.label, () => {
          const current = normalizeTableSort(store.get().tableSort);
          store.set({ tableSort: { key: col.key, direction: current.key === col.key && current.direction === 'asc' ? 'desc' : 'asc' } });
        }, { class: 'table-sort', 'aria-label': `Sort by ${col.label}${col.unit ? ` (${col.unit})` : ''}` }),
        button('', e => openFilter(col, e.currentTarget), { class: 'table-filter', html: icon('funnel'), 'aria-label': `Filter ${col.label}${col.unit ? ` (${col.unit})` : ''}`, 'aria-haspopup': 'dialog' })),
        h('small', { text: col.unit || '\u00a0' }))));
    }
    for (const th of headerRow.children) {
      const col = column(th.dataset.column), active = sort.key === col.key;
      th.setAttribute('aria-sort', active ? sort.direction === 'asc' ? 'ascending' : 'descending' : 'none');
      th.querySelector('.table-sort').textContent = `${col.label}${active ? sort.direction === 'asc' ? ' ↑' : ' ↓' : ''}`;
      th.querySelector('.table-filter').classList.toggle('active', filters().some(f => f.key === col.key));
    }
    sortNote.hidden = cols.some(c => c.key === sort.key);
    if (!sortNote.hidden) sortNote.replaceChildren(h('span', { text: `Sorted by ${column(sort.key).label} ${sort.direction === 'asc' ? '↑' : '↓'}` }),
      button('Reset to galaxy name', () => store.set({ tableSort: { key: 'name', direction: 'asc' } })));
  }
  function render() {
    if (root.hidden || !dirty || renderFrame) return;
    renderFrame = requestAnimationFrame(() => {
      renderFrame = 0;
      if (root.hidden || !dirty) return;
      dirty = false;
      const ctx = phangsTableContext(app), state = store.get(), cols = visibleTableColumns(state), sort = normalizeTableSort(state.tableSort);
      const rows = sortPhangsRows((catalogue?.galaxies || []).filter(r => matchesPhangsSelection(r, state.phangs, ctx)), sort, ctx);
      updateStatus(rows.length); renderHeaders(cols, sort);
      const { x, y } = position();
      body.replaceChildren(...rows.map(row => h('tr', {}, ...cols.map(col => {
        const value = col.value(row, ctx), text = formatCell(col, value);
        const td = h(col.key === 'name' ? 'th' : 'td', { ...(col.key === 'name' ? { scope: 'row' } : {}), class: col.type === 'number' ? 'numeric' : '', title: text });
        td.append(col.key === 'name' || col.detail(row, ctx) ? button(text, null, {
          class: col.key === 'name' ? 'table-galaxy-name' : 'table-cell-detail', 'data-galaxy': row.name, 'data-column': col.key,
          'aria-label': col.key === 'name' ? `Inspect ${row.name.toUpperCase()}` : `${col.label}: ${text}${col.unit ? ` ${col.unit}` : ''}; details` }) : h('span', { text }));
        return td;
      }))));
      scroll.scrollLeft = x; scroll.scrollTop = y;
      empty.hidden = !!rows.length;
      empty.textContent = !ready ? 'Loading galaxies…' : failed ? 'Galaxy data unavailable.' : 'No galaxies match. Remove a filter or clear all to restore the sample.';
    });
  }
  function sync() {
    const state = store.get(), on = state.presentation === 'table', group = normalizeTablePreset(state.tablePreset);
    if (!root.hidden && (!on || group !== currentGroup)) savePosition();
    currentGroup = group;
    const layoutChanged = root.hidden === on;
    root.hidden = !on; plotTools.hidden = on;
    stage.setAttribute('aria-label', on ? 'PHANGS galaxy catalogue' : 'Projection of the PHANGS Galaxy Manifold');
    document.documentElement.classList.toggle('gm-table-mode', on);
    if (layoutChanged) app.measure?.();
    app.layers.stageUI.inert = on;
    document.getElementById('console').inert = on;
    tableButton.setAttribute('aria-pressed', String(on)); plotButton.setAttribute('aria-pressed', String(!on));
    for (const [id, control] of groupButtons) control.setAttribute('aria-pressed', String(group === id));
    if (on && filterStrip.parentNode !== root) root.insertBefore(filterStrip, scroll);
    if (!on && filterStrip.parentNode !== stage) stage.append(filterStrip);
    renderFilters(); render();
  }
  events.on('state', ({ changed }) => {
    if (!changed.some(k => ['phangs', 'tableSort', 'tablePreset', 'tableColumns', 'presentation'].includes(k))) return;
    dirty = true; sync();
  });
  events.on('phangs:ready', c => { catalogue = c; ready = true; failed = !c; dirty = true; sync(); });
  events.on('phangs:measurements', () => { dirty = true; sync(); });
  events.on('phangs:count', counts => {
    plotStatus.textContent = `${counts.matching} selected · ${counts.visible} plotted${counts.matching > 0 && counts.supported === 0 ? ' · Current axes lack PHANGS measurements' : ''}`;
  });
  sync();
  return { switchMount, closePanel, get dialogOpen() { return dialog.open; }, get open() { return !root.hidden; } };
}
