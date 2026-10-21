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
  const overview = row.morphology_overview;
  const source = 'Supplied Galaxy Morph Overview CSV';
  if (overview?.gleis26_ring?.split(',').map(s => s.trim()).includes('r'))
    chips.push({ label: 'Ring · Gleis+26', detail: `${source}, Gleis+26 Ring column: ${overview.gleis26_ring}` });
  if (overview?.gleis26_ring?.includes('ETG')) chips.push({ label: 'ETG · Gleis+26', detail: `${source}, Gleis+26 Ring column: ${overview.gleis26_ring}` });
  if (overview?.mw_like_evans26 === 'E' || overview?.mw_like_evans26 === '(E)')
    chips.push({ label: `${overview.mw_like_evans26 === '(E)' ? 'Tentative MW-like' : 'MW-like'} · Evans+26`, detail: `${source}, Evans+26 MW-like column: ${overview.mw_like_evans26}` });
  if (overview?.agn_veron === 'Y') chips.push({ label: 'AGN · Véron', detail: `${source}, VC catalogue AGN flag: Y` });
  if (overview?.agn_asmus === 'Y') chips.push({ label: 'AGN · Asmus', detail: `${source}, Asmus AGN flag: Y` });
  if (src.agn_veron_class) chips.push({ label: `Nuclear class ${src.agn_veron_class}`, detail: 'Véron classification as recorded in PHANGS v1p6; original class code preserved' });
  return chips;
}

export function phangsDataChips(row) {
  const chips = phangsSurveyEntries(row).filter(s => ['released', 'observed_not_released'].includes(row.source[`survey_${s.id}_status`]))
    .map(s => ({ label: s.instrument ? `${s.label === 'ALMA' ? 'ALMA · Nominal PHANGS' : s.label} · ${s.instrument.replaceAll(';', ' + ')}` : s.label,
      detail: 'Recorded observations in the supplied PHANGS v1p6 table' }));
  if (row.morphology_overview?.ecmz === 'CMZ') chips.push({ label: 'ALMA · eCMZ', detail: 'eCMZ (30 pc CO) membership recorded in the supplied morphology overview' });
  if (row.morphology_overview?.dense_gas_surveys?.includes('A')) chips.push({ label: 'ALMA · ALMOND', detail: 'ALMOND membership (A) recorded in the supplied morphology overview' });
  return chips;
}

export function buildPhangsChips(row) {
  const wrap = h('div', { class: 'phangs-context' });
  const add = (label, chips, kind) => {
    const group = h('div', { class: `phangs-chip-group ${kind}`, role: 'group', 'aria-label': label });
    group.append(h('span', { class: 'phangs-chip-heading', text: label }));
    for (const spec of chips) {
      const chip = h('span', { class: 'phangs-chip', text: spec.label, title: spec.detail });
      setTip(chip, { title: spec.label, sub: spec.detail }, 'left');
      group.append(chip);
    }
    if (!chips.length) group.append(h('span', { class: 'phangs-note', text: 'Not recorded' }));
    wrap.append(group);
  };
  add(row.nebula ? 'Host-galaxy properties' : 'Galaxy properties', phangsPropertyChips(row), 'physical');
  add('Available datasets', phangsDataChips(row), 'observations');
  wrap.append(h('p', { class: 'phangs-note', text: 'Coverage uses the supplied PHANGS catalogue and morphology overview. Unlisted datasets are not necessarily absent.' }));
  return wrap;
}
