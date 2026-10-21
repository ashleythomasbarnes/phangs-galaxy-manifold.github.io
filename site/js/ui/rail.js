// PHANGS observation chips. Survey selections intersect and only filter PHANGS markers.
import { h } from './dom.js';
import { icon } from './icons.js';
import { setTip } from './tooltip.js';
import { createPopover } from './popover.js';
import { PHANGS_SURVEYS, SURVEY_STATUSES, ALMA_ARRAYS, matchesSurvey, matchesPhangsSurveys } from '../data/surveys.js';

export function initRail(app, mount, ui) {
  const { store, events } = app;
  const filters = () => store.get().phangs?.surveys || {};
  const toggle = h('input', { type: 'checkbox', 'aria-label': 'Show PHANGS galaxies' });
  toggle.addEventListener('change', () => app.actions.setOverlay('phangs', toggle.checked));
  const root = h('div', { class: 'survey-rail' });
  const summary = h('span', { class: 'survey-total', text: 'Loading…', role: 'status' });
  const clear = h('button', { class: 'survey-clear', type: 'button', text: 'Clear filters', hidden: true });
  const note = h('p', { class: 'survey-rail-note', text: 'Coverage recorded in v1p6' });
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
      const status = SURVEY_STATUSES.find(t => t.id === f?.status)?.label;
      const array = s.id === 'alma' && f?.array !== 'any' ? ALMA_ARRAYS.find(a => a.id === f?.array)?.label : null;
      return { title: s.label, sub: s.missing || s.desc, meta: [status, array, 'PHANGS v1p6'].filter(Boolean).join(' · ') };
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
  root.append(clear, note);
  clear.addEventListener('click', () => store.set({ phangs: { surveys: Object.fromEntries(PHANGS_SURVEYS.map(s => [s.id, null])) } }));

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
    body.replaceChildren(option('No filter', 'Keep all PHANGS galaxies', 'All', !current, () => select(s, null)),
      h('h3', { class: 'popover-eyebrow', text: 'Observation status' }));
    for (const t of SURVEY_STATUSES) {
      const f = { status: t.id, array: current?.array || 'any' };
      const n = catalogue.galaxies.filter(r => matchesSurvey(r, s, f)).length;
      if (!n && t.id === 'awarded_not_observed') continue;
      body.append(option(t.label, t.sub, n, current?.status === t.id, () => select(s, f)));
    }
    if (s.id === 'alma') {
      body.append(h('h3', { class: 'popover-eyebrow', text: 'Array configuration' }));
      for (const a of ALMA_ARRAYS) {
        const f = { status: current?.status || 'observed', array: a.id };
        const n = catalogue.galaxies.filter(r => matchesSurvey(r, s, f)).length;
        body.append(option(a.label, null, n, !!current && current.array === a.id, () => select(s, f)));
      }
      body.append(h('p', { class: 'survey-array-note', text: 'Recorded array combination; spatial coverage may be incomplete. TP = total power.' }));
    }
    body.append(h('p', { class: 'popover-foot', text: 'Selections across surveys must all match. Only PHANGS points are filtered. Statuses refer to v1p6.' }));
    if (focused) [...body.querySelectorAll('button')].find(b => b.dataset.choice === focused)?.focus({ preventScroll: true });
    pop.place();
  }
  function update() {
    toggle.checked = store.get().overlays.phangs !== false;
    toggle.disabled = failed;
    const active = PHANGS_SURVEYS.filter(s => filters()[s.id]);
    clear.hidden = !active.length;
    root.classList.toggle('filtered', !!active.length);
    summary.textContent = catalogue ? `${catalogue.galaxies.filter(r => matchesPhangsSurveys(r, filters())).length} / ${catalogue.galaxies.length} selected` : failed ? 'Unavailable' : 'Loading…';
    note.textContent = active.length ? 'All selected surveys must match' : 'Coverage recorded in v1p6';
    for (const { s, chip, tally, pop } of items.values()) {
      const f = filters()[s.id];
      chip.classList.toggle('selected', !!f);
      chip.classList.toggle('unrecorded', !s.field);
      tally.textContent = !s.field ? '–' : !catalogue ? '…' : catalogue.galaxies.filter(r => matchesSurvey(r, s, f || undefined)).length;
      chip.setAttribute('aria-label', `${s.label} observations${catalogue && s.field ? `, ${tally.textContent} galaxies` : ''}${f ? ', filter active' : ''}${!s.field ? ', coverage not recorded' : ''}`);
      if (pop.open) renderPanel(s);
    }
  }
  events.on('phangs:ready', c => { catalogue = c; failed = !c; update(); });
  events.on('state', ({ changed }) => { if (changed.some(k => ['phangs', 'overlays'].includes(k))) update(); });
  update();
  return { close: () => { let closed = false; for (const i of items.values()) closed = i.pop.close() || closed; return closed; } };
}
