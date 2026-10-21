// Compact catalogue context for the host, including when inspecting one H II region.
import { h } from './dom.js';
import { setTip } from './tooltip.js';
import { phangsSurveyEntries } from './phangs-info.js';

export function phangsPropertyChips(row) {
  const src = row.source || {}, chips = [];
  if (src.morph_string) chips.push({ label: `Type ${src.morph_string}`, detail: 'Morphological type recorded in the PHANGS v1p6 table' });
  if (Number.isFinite(src.morph_t)) chips.push({ label: `T ${src.morph_t.toFixed(1)}`, detail: 'Numerical Hubble stage from the PHANGS table' });
  if (src.morph_bar_flag === 1 || src.morph_bar === 'BAR') chips.push({ label: 'Barred', detail: 'Bar recorded in the PHANGS table' });
  if (src.morph_spiral_arms === 1) chips.push({ label: 'Spiral arms', detail: 'Spiral arms recorded in the PHANGS table' });
  if (src.morph_interacting === 1) chips.push({ label: 'Interacting', detail: 'Interaction flag = 1 in the PHANGS table' });
  if (src.morph_interacting === 0.5) chips.push({ label: 'Possible interaction', detail: 'Intermediate interaction flag = 0.5 in the PHANGS table' });
  if (Number.isFinite(src.dist) && src.dist > 0) chips.push({ label: `${src.dist.toFixed(1)} Mpc`, detail: 'Adopted PHANGS distance' });
  if (Number.isFinite(src.orient_incl)) chips.push({ label: `i ${src.orient_incl.toFixed(0)}°`, detail: 'Adopted PHANGS inclination' });
  return chips;
}

export function phangsDataChips(row) {
  return phangsSurveyEntries(row).filter(s => ['released', 'observed_not_released'].includes(row.source[`survey_${s.id}_status`]))
    .map(s => ({ label: s.instrument ? `${s.label} · ${s.instrument.replaceAll(';', ' + ')}` : s.label,
      detail: `${s.status} in the supplied v1p6 table`, pending: row.source[`survey_${s.id}_status`] === 'observed_not_released' }));
}

export function buildPhangsChips(row) {
  const wrap = h('div', { class: 'phangs-context' });
  const add = (label, chips, kind) => {
    const group = h('div', { class: `phangs-chip-group ${kind}`, role: 'group', 'aria-label': label });
    group.append(h('span', { class: 'phangs-chip-heading', text: label }));
    for (const spec of chips) {
      const chip = h('span', { class: `phangs-chip${spec.pending ? ' awaiting' : ''}`, text: spec.label, title: spec.detail });
      setTip(chip, { title: spec.label, sub: spec.detail }, 'left');
      group.append(chip);
    }
    if (!chips.length) group.append(h('span', { class: 'phangs-note', text: 'Not recorded' }));
    wrap.append(group);
  };
  add(row.nebula ? 'Host-galaxy properties' : 'Galaxy properties', phangsPropertyChips(row), 'physical');
  add('Recorded observations · v1p6', phangsDataChips(row), 'observations');
  wrap.append(h('p', { class: 'phangs-note', text: 'Dashed chips await release in v1p6. Unlisted surveys may have newer data; full recorded statuses are below.' }));
  return wrap;
}
