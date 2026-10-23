// PHANGS observation chips. Survey selections intersect and only filter PHANGS markers.
import { matchesPhangsSelection, phangsTableContext } from '../data/phangs-table.js';
import { h } from './dom.js';
import { icon } from './icons.js';
import { setTip } from './tooltip.js';
import { createPopover } from './popover.js';
import { PHANGS_SURVEYS, ALMA_PROGRAMS, ALMA_ARRAYS, matchesSurvey } from '../data/surveys.js?v=2';

export function initRail(app, mount, ui) {
  const { store, events } = app;
  const filters = () => store.get().phangs?.surveys || {};
  const toggle = h('input', { type: 'checkbox', 'aria-label': 'Show PHANGS galaxies' });
  toggle.addEventListener('change', () => app.actions.setOverlay('phangs', toggle.checked));
  const root = h('div', { class: 'survey-rail' });
  const summary = h('span', { class: 'survey-total', text: 'Loading…', role: 'status' });
  const note = h('p', { class: 'survey-rail-note', text: 'PHANGS catalogue + morphology overview' });
  root.append(h('div', { class: 'survey-rail-head' },
    h('label', { class: 'survey-overlay-toggle' }, h('b', { text: 'PHANGS' }), toggle),
    h('span', { text: 'Observations' })), summary);
  mount.replaceChildren(root);
  mount.setAttribute('aria-label', 'PHANGS observations');
  const items = new Map();
  let catalogue = null, failed = false;

  for (const s of PHANGS_SURVEYS) {
    const tally = h('span', { class: 'survey-tally', text: '…' });
    const chip = h('button', { type: 'button', class: 'survey-chip', 'data-survey': s.id,
      'aria-label': `${s.label} observations`, 'aria-haspopup': 'dialog', style: { '--survey-color': s.color } },
      h('i', { class: 'survey-dot', 'aria-hidden': 'true' }), h('span', { text: s.label }), tally);
    setTip(chip, () => {
      const f = filters()[s.id];
      const program = s.id === 'alma' ? ALMA_PROGRAMS.find(p => p.id === f?.program)?.label : f ? 'Data available' : null;
      const array = s.id === 'alma' && f?.array !== 'any' ? ALMA_ARRAYS.find(a => a.id === f?.array)?.label : null;
      return { title: s.label, sub: s.missing || s.desc, meta: [program, array].filter(Boolean).join(' · ') };
    }, 'right');
    const body = h('div', { class: 'survey-body' });
    const closeButton = h('button', { type: 'button', class: 'ibtn', 'aria-label': `Close ${s.label} filters`, html: icon('close') });
    const panel = h('section', { id: `survey-${s.id}-panel`, class: 'control-popover survey-panel', role: 'dialog',
      'aria-label': `${s.label} observation filters`, style: { '--survey-color': s.color } },
      h('div', { class: 'popover-head' }, h('div', {}, h('span', { class: 'popover-eyebrow', text: 'PHANGS observations' }), h('h2', { text: s.label })), closeButton),
      h('p', { class: 'popover-sub', text: s.desc }), body);
    const pop = createPopover(chip, panel, { side: 'right' });
    closeButton.addEventListener('click', () => pop.close(true));
    chip.addEventListener('click', () => {
      if (pop.open) return pop.close(true);
      ui.closeMenus();
      renderPanel(s);
      pop.show();
    });
    items.set(s.id, { s, chip, tally, body, pop });
    root.append(chip);
  }
  root.append(note);

  function select(s, filter) {
    store.set({ phangs: { surveys: { [s.id]: filter } }, overlays: { phangs: true } });
  }
  function renderPanel(s) {
    const { body, pop } = items.get(s.id);
    const focused = body.contains(document.activeElement) ? document.activeElement.dataset.choice : null;
    if (s.missing || !catalogue) {
      body.replaceChildren(h('p', { class: 'survey-missing', text: s.missing || (failed ? 'PHANGS catalogue unavailable.' : 'Loading coverage…') }),
        h('p', { class: 'popover-foot', text: 'Unrecorded coverage does not mean that a galaxy has no observations.' }));
      return;
    }
    const current = filters()[s.id];
    const option = (label, sub, n, on, onClick) => h('button', { type: 'button', class: 'survey-option', 'data-choice': label, 'aria-pressed': String(on), onclick: onClick },
      h('i', { class: 'option-mark', 'aria-hidden': 'true' }), h('span', {}, h('b', { text: label }), sub ? h('small', { text: sub }) : null), h('span', { class: 'option-count', text: n }));
    body.replaceChildren(option('No filter', 'Keep all PHANGS galaxies', 'All', !current, () => select(s, null)));
    const addChoice = (label, filter, on, parent = body) => {
      const n = catalogue.galaxies.filter(r => matchesSurvey(r, s, filter)).length;
      parent.append(option(label, null, n, on, () => select(s, filter)));
    };
    const available = { status: 'observed', array: 'any', ...(s.id === 'alma' ? { program: 'any' } : {}) };
    addChoice('Data available', available, !!current && (s.id !== 'alma' || current.program === 'any'));
    if (s.id === 'alma') {
      const nominal = { status: 'observed', program: 'nominal', array: 'any' };
      const isNominal = !!current && (!current.program || current.program === 'nominal');
      addChoice('Nominal PHANGS', nominal, isNominal && current.array === 'any');
      const arrays = h('div', { class: 'survey-array-subsection', role: 'group', 'aria-label': 'Nominal PHANGS array configuration' },
        h('h3', { class: 'popover-eyebrow', text: 'Array configuration' }));
      for (const a of ALMA_ARRAYS.filter(a => a.id !== 'any'))
        addChoice(a.label, { ...nominal, array: a.id }, isNominal && current.array === a.id, arrays);
      body.append(arrays);
      for (const p of ALMA_PROGRAMS.filter(p => ['ecmz', 'almond'].includes(p.id)))
        addChoice(p.label, { status: 'observed', program: p.id, array: 'any' }, current?.program === p.id);
    }
    body.append(h('p', { class: 'popover-foot', text: s.id === 'alma' ? 'Selections across telescopes must all match. ALMA survey membership uses the supplied catalogue and morphology overview; blank entries are unrecorded.' : 'Selections across telescopes must all match. Only the PHANGS sample is filtered.' }));
    if (focused) [...body.querySelectorAll('button')].find(b => b.dataset.choice === focused)?.focus({ preventScroll: true });
    pop.place();
  }
  function update() {
    toggle.checked = store.get().overlays.phangs !== false;
    toggle.disabled = failed;
    const active = PHANGS_SURVEYS.filter(s => filters()[s.id]);
    root.classList.toggle('filtered', !!active.length);
    summary.textContent = catalogue ? `${catalogue.galaxies.filter(r => matchesPhangsSelection(r, store.get().phangs, phangsTableContext(app))).length} / ${catalogue.galaxies.length} selected` : failed ? 'Unavailable' : 'Loading…';
    note.textContent = active.length ? 'All selected surveys must match' : 'PHANGS catalogue + morphology overview';
    for (const { s, chip, tally, pop } of items.values()) {
      const f = filters()[s.id];
      chip.classList.toggle('selected', !!f);
      chip.classList.toggle('unrecorded', !s.field);
      tally.textContent = !s.field ? '–' : !catalogue ? '…' : catalogue.galaxies.filter(r => matchesSurvey(r, s, f || { status: 'observed', array: 'any', program: 'any' })).length;
      chip.setAttribute('aria-label', `${s.label} observations${catalogue && s.field ? `, ${tally.textContent} galaxies` : ''}${f ? ', filter active' : ''}${!s.field ? ', coverage not recorded' : ''}`);
      if (pop.open) renderPanel(s);
    }
  }
  events.on('phangs:measurements', update);
  events.on('phangs:ready', c => { catalogue = c; failed = !c; update(); });
  events.on('state', ({ changed }) => { if (changed.some(k => ['phangs', 'overlays'].includes(k))) update(); });
  update();
  return { openSurvey: id => {
    const item = items.get(id);
    if (!item) return;
    ui.closeMenus(); renderPanel(item.s); item.pop.show();
  }, close: () => { let closed = false; for (const i of items.values()) closed = i.pop.close() || closed; return closed; } };
}
