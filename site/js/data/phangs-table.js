// One registry and predicate for the table, markers, regions, search and counts.
import { matchesGalaxyName } from './galaxy-names.js';
import { normalizeSurveyFilters, matchesPhangsSurveys } from './surveys.js';
import { NEBULA_KEYS, NEBULA_LABELS, NEBULA_SUMMARIES } from './nebulae.js';

export const PHANGS_COLUMNS = [];
const add = (key, label, group, type, unit, value, detail = () => '') =>
  PHANGS_COLUMNS.push({ key, label, group, type, unit, value, detail });
const sourceDetail = (row, key) => {
  const src = row.source || {};
  return [Number.isFinite(src[`${key}_unc`]) ? `Uncertainty: ${src[`${key}_unc`]}${key === 'dist' ? ' dex' : ['orient_ra', 'orient_dec'].includes(key) ? ' arcsec' : ''}` : '',
    src[`${key}_method`] && `Method: ${src[`${key}_method`]}`,
    src[`${key}_ref`] && `Reference: ${src[`${key}_ref`]}`].filter(Boolean).join('\n');
};
add('name', 'Galaxy', 'Identifiers', 'text', '', r => r.name, r => `Aliases: ${r.source?.alias || 'Not recorded'}`);
add('pgc', 'PGC', 'Identifiers', 'number', '', r => r.source?.pgc);
for (const [key, label] of [['ra', 'RA'], ['dec', 'Dec']])
  add(key, label, 'Identifiers', 'number', 'deg', r => r[key], r => sourceDetail(r, `orient_${key}`));

for (const [key, label, unit] of [
  ['props_mstar', 'Stellar mass', 'M☉'], ['props_sfr', 'SFR', 'M☉ yr⁻¹'], ['props_mhi', 'H I mass', 'M☉'],
  ['props_mtol', 'Stellar mass-to-light ratio', ''], ['props_deltams', 'Offset from main sequence', 'dex'],
  ['dist', 'Distance', 'Mpc'], ['orient_vlsr', 'Systemic velocity (LSR)', 'km s⁻¹'],
  ['orient_incl', 'Inclination', 'deg'], ['orient_posang', 'Position angle', 'deg'],
]) add(key, label, 'Physical properties', 'number', unit, r => r.source?.[key], r =>
  [sourceDetail(r, key), key.startsWith('orient_') ? r.source?.orient_ref : '',
    key === 'dist' ? `Distance method: ${r.source?.dist_label || 'Not recorded'}` : key === 'props_mstar' ? `Mass-to-light method: ${r.source?.props_mtol_method || 'Not recorded'}` : ''].filter(Boolean).join('\n'));
for (const [key, label, unit] of [
  ['logM', 'log M★', 'log₁₀(M☉)'], ['logSFR', 'log SFR', 'log₁₀(M☉ yr⁻¹)'],
  ['logsSFR', 'log sSFR', 'log₁₀(yr⁻¹)'], ['logfHI', 'log H I / M★', 'dex'],
  ['logSigma', 'log Σ★ (R90)', 'log₁₀(M☉ kpc⁻²)'], ['z', 'Approximate LSR redshift', ''],
]) add(key, label, 'Physical properties', 'number', unit, r => r.values?.[key], () =>
  key === 'logSigma' ? 'Σ★ = M★/(π R90²), circular area, no inclination correction. No density uncertainty is estimated.' :
    key === 'z' ? 'vLSR/c; not a heliocentric spectroscopic redshift.' : 'Derived from the PHANGS global catalogue measurements.');
add('sigma', 'Σ★ (R90)', 'Physical properties', 'number', 'M☉ kpc⁻²', r =>
  Number.isFinite(r.values?.logSigma) ? 10 ** r.values.logSigma : null, () => 'M★/(π R90²); circular area, no inclination correction.');
for (const [key, label] of [['size_r90', 'R90'], ['size_r25', 'R25'], ['size_reff', 'Stellar effective radius'], ['size_scalelength', 'Stellar scale length'], ['ned_exponential_size', 'NED r-band exponential Rₑ']]) {
  for (const unit of ['arcsec', 'kpc']) add(`${key}_${unit}`, label, 'Sizes', 'number', unit,
    r => (key === 'ned_exponential_size' ? r[key] : r.sizes?.[key])?.[unit], r => {
      const size = key === 'ned_exponential_size' ? r[key] : r.sizes?.[key];
      return [Number.isFinite(size?.[`unc_${unit}`]) ? `Uncertainty: ${size[`unc_${unit}`]} ${unit}` : 'Uncertainty not recorded.',
        size?.reference || r.source?.[`${key}_ref`], 'Distinct size definition; not SDSS Petrosian R50.',
        unit === 'kpc' ? 'Uses PHANGS distance; uncertainties combine angular and distance errors assuming independence.' : ''].filter(Boolean).join('\n');
    });
}

// Every science field in the supplied morphology record, with source uncertainties in details.
const morphology = [
  ['t', 'Hubble stage T', 'number'], ['string', 'Morphological type', 'category'], ['bar', 'Bar class', 'category'],
  ['buta15', 'Buta 2015 morphology', 'category'], ['class', 'Morphology class', 'category'], ['gold', 'Gold sample', 'category'],
  ['bar_flag', 'Bar flag', 'category'], ['bar_axis_ratio', 'Bar axis ratio', 'number'], ['bar_pa', 'Bar PA', 'number', 'deg'],
  ['bar_r', 'Bar radius', 'number', 'arcsec'], ['bar_red', 'Reduced bar radius (catalogue)', 'number'], ['bar_q_flag', 'Bar quality flag', 'category'],
  ['nuclear_bar_axis_ratio', 'Nuclear bar axis ratio', 'number'], ['nuclear_bar_pa', 'Nuclear bar PA', 'number', 'deg'], ['nuclear_bar_r', 'Nuclear bar radius', 'number', 'arcsec'],
  ['spiral_arms', 'Spiral arms', 'category'], ['multi_arm', 'Multiple arms', 'category'], ['featureless', 'Featureless', 'category'],
  ['rings_outer', 'Outer rings', 'category'], ['ring_inner', 'Inner ring', 'category'], ['vcc', 'VCC', 'category'],
  ['interacting', 'Interaction flag', 'category'], ['in_virgo_fornax', 'Virgo / Fornax', 'category'], ['high_peculiar', 'Highly peculiar', 'category'],
];
for (const prefix of ['disk_1', 'disk_2', 'bulge', 'lens_1', 'lens_2', 'ring_1', 'ring_2']) {
  const label = prefix.replaceAll('_', ' ');
  for (const [suffix, name, unit] of [['axis_ratio', 'axis ratio', ''], ['pa', 'PA', 'deg'], ['r', 'radius', 'arcsec']])
    morphology.push([`${prefix}_${suffix}`, `${label} ${name}`, 'number', unit]);
}
for (const [field, label, type, unit = ''] of morphology) {
  const key = `morph_${field}`;
  add(key, label, 'Morphology', type, unit, r => r.source?.[key], r =>
    [sourceDetail(r, key), r.source?.morph_comments].filter(Boolean).join('\n'));
}
for (const [key, label] of Object.entries({ agn_veron_y_n: 'AGN flag · Véron (v1p6)', agn_veron_class: 'Nuclear class · Véron', agn_milliquas_y_n: 'AGN flag · Milliquas', agn_milliquas_class_pQSO: 'Class / QSO probability · Milliquas' }))
  add(key, label, 'Morphology', 'category', '', r => r.source?.[key]);
for (const [key, label] of Object.entries({ agn_veron: 'AGN · Véron', agn_asmus: 'AGN · Asmus', outflow_stuber21: 'Outflow · Stuber+21',
  dense_gas_surveys: 'Dense-gas surveys', ecmz: 'eCMZ', gleis26_ring: 'Rings · Gleis+26', mw_like_evans26: 'MW-like · Evans+26' }))
  add(`overview_${key}`, label, 'Morphology', 'category', '', r => key === 'dense_gas_surveys' ? r.morphology_overview?.[key]?.join(', ') : r.morphology_overview?.[key], r =>
    `Supplied morphology overview; source name: ${r.morphology_overview?.source_name || 'Not recorded'}. Original classification code retained.`);
for (const [id, label] of Object.entries({ astrosat: 'AstroSat', galex: 'GALEX', halpha: 'Hα imaging', muse: 'MUSE', kcwi: 'KCWI', sitelle: 'SITELLE', typhoon: 'TYPHOON', hst: 'HST', irac: 'Spitzer IRAC', mips: 'Spitzer MIPS', wise: 'WISE', herschel: 'Herschel', alma: 'ALMA', otherco: 'Other CO', hiresco: 'High-resolution CO', multijco: 'Multiple CO transitions', dense: 'Dense gas', hi: 'H I' })) {
  for (const field of ['status', 'instrument']) add(`survey_${id}_${field}`, `${label} ${field === 'status' ? 'coverage' : 'instrument'}`, 'Survey coverage', 'category', '', r => r.source?.[`survey_${id}_${field}`], r =>
    [r.source?.[`survey_${id}_notes`], r.source?.[`survey_${id}_references`], 'Recorded PHANGS v1p6 coverage; unrecorded does not imply no observations.'].filter(Boolean).join('\n'));
}
for (const [key, label] of Object.entries(NEBULA_LABELS)) {
  add(`muse_${key}`, label, 'MUSE summaries', 'number', '', (r, ctx) => {
    const host = ctx.summary?.(r.name), method = ctx.method || 'mean';
    return NEBULA_KEYS.includes(key) ? host?.values?.[method]?.[key] : host?.native?.[key]?.[method === 'median' ? 'median' : 'mean'];
  }, (r, ctx) => {
    const host = ctx.summary?.(r.name), method = ctx.method || 'mean', native = !NEBULA_KEYS.includes(key);
    const stats = native ? host?.native?.[key] : host?.stats?.[key];
    return `${NEBULA_SUMMARIES[native && method === 'summed' ? 'mean' : method]}. ${native ? 'Native catalogue quantity.' : 'Galaxy diagnostic.'}\n` +
      `${!native && method === 'summed' ? host?.summed_counts?.[key] ?? 'No' : stats?.n ?? 'No'} contributing regions.\n` +
      `Hα-weighted 16–84% range: ${stats?.p16 ?? 'Unavailable'} to ${stats?.p84 ?? 'Unavailable'}. Population spread, not measurement uncertainty.\nCatalogued H II regions within the MUSE footprint; not an SDSS fibre measurement.`;
  });
}
const byKey = new Map(PHANGS_COLUMNS.map(c => [c.key, c]));
const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
export const missing = v => v == null || (typeof v === 'number' && !Number.isFinite(v)) || (typeof v === 'string' && !v.trim());
const statuses = { released: 'Released', observed_not_released: 'Observed, awaiting release', awarded_not_observed: 'Awarded, not observed', intended_not_awarded: 'Intended, not awarded', not_in_survey: 'Outside survey', cannot_be_observed: 'Cannot be observed' };
export function formatCell(column, value) {
  if (missing(value)) return '—';
  if (column.key === 'name') return String(value).toUpperCase();
  if (column.type === 'number') {
    if (column.key !== 'pgc' && (Math.abs(value) >= 1e6 || (value !== 0 && Math.abs(value) < 1e-3))) return Number(value).toExponential(4);
    return Number(value).toLocaleString('en-US', { maximumSignificantDigits: column.key === 'pgc' ? 12 : 5, useGrouping: false });
  }
  if (column.key.startsWith('survey_') && column.key.endsWith('_status') && Object.hasOwn(statuses, value)) return statuses[value];
  if (column.key === 'morph_interacting' && String(value) === '0.5') return 'Possible interaction (0.5)';
  if (/^morph_(bar_flag|spiral_arms|multi_arm|featureless|interacting|in_virgo_fornax|high_peculiar)$/.test(column.key) && ['0', '1'].includes(String(value))) return String(value) === '1' ? 'Yes (1)' : 'No (0)';
  return String(value);
}
export function normalizeColumnFilters(filters) {
  if (!Array.isArray(filters)) return [];
  const valid = new Map();
  for (const f of filters) {
    const col = byKey.get(f?.key);
    if (!col || !f || typeof f !== 'object') continue;
    const clean = { key: col.key };
    if (['missing', 'present'].includes(f.presence)) clean.presence = f.presence;
    if (clean.presence !== 'missing') {
      if (col.type === 'number') {
        for (const k of ['min', 'max']) if (typeof f[k] === 'number' && Number.isFinite(f[k])) clean[k] = f[k];
        if (clean.min != null && clean.max != null && clean.min > clean.max) continue;
      } else if (col.type === 'text' && typeof f.text === 'string' && f.text.trim()) clean.text = f.text.trim();
      else if (col.type === 'category' && Array.isArray(f.values)) clean.values = [...new Set(f.values.filter(v => ['string', 'number'].includes(typeof v) && !missing(v)).map(String))];
    }
    if (Object.keys(clean).some(k => k !== 'key' && (k !== 'values' || clean.values.length))) valid.set(col.key, clean);
  }
  return [...valid.values()];
}
export function normalizeTableSort(sort) {
  return { key: byKey.has(sort?.key) ? sort.key : 'name', direction: sort?.direction === 'desc' ? 'desc' : 'asc' };
}
export function phangsTableContext(app) {
  const nebulae = app.overlays?.phangs?.nebulae;
  return { summary: name => nebulae?.summary?.(name), method: app.store.get().phangs?.nebulaSummary || 'mean', museReady: !!nebulae?.catalogue };
}
export function matchesPhangsSelection(row, state = {}, ctx = {}) {
  if (!matchesGalaxyName(row, state.nameQuery) || !matchesPhangsSurveys(row, state.surveys)) return false;
  return (state.columnFilters || []).every(f => {
    const col = byKey.get(f.key);
    if (!col) return true;
    if (col.group === 'MUSE summaries' && ctx.museReady === false) return false;
    const v = col.value(row, ctx);
    if (f.presence === 'missing') return missing(v);
    if (missing(v)) return false;
    if (col.type === 'number') return (f.min == null || v >= f.min) && (f.max == null || v <= f.max);
    if (col.type === 'text') return !f.text || String(v).toLowerCase().includes(f.text.toLowerCase());
    return !f.values?.length || f.values.includes(String(v));
  });
}
export function sortPhangsRows(rows, sort, ctx = {}) {
  const { key, direction } = normalizeTableSort(sort), col = byKey.get(key), sign = direction === 'desc' ? -1 : 1;
  return [...rows].sort((a, b) => {
    const av = col.value(a, ctx), bv = col.value(b, ctx), am = missing(av), bm = missing(bv);
    if (am !== bm) return am ? 1 : -1;
    const order = am ? 0 : col.type === 'number' ? av - bv : collator.compare(String(av), String(bv));
    return order * sign || collator.compare(a.name, b.name);
  });
}
export const TABLE_PRESETS = [
  { id: 'global', label: 'Global', keys: ['name', 'logM', 'logSFR', 'logsSFR', 'dist', 'orient_incl', 'morph_string'] },
  { id: 'sizes', label: 'Sizes', keys: ['name', 'dist', 'size_r90_kpc', 'size_r25_kpc', 'size_reff_kpc', 'size_scalelength_kpc', 'ned_exponential_size_kpc'] },
  { id: 'morphology', label: 'Morphology', keys: ['name', 'morph_string', 'morph_t', 'morph_bar', 'morph_interacting', 'overview_gleis26_ring', 'overview_mw_like_evans26'] },
  { id: 'observations', label: 'Observations', keys: ['name', 'survey_alma_status', 'survey_alma_instrument', 'overview_ecmz', 'overview_dense_gas_surveys', 'survey_muse_status', 'survey_hst_status', 'survey_hi_status', 'survey_hi_instrument'] },
  { id: 'muse', label: 'MUSE', keys: ['name', 'muse_OH_PP04', 'muse_N2Ha', 'muse_O3Hb', 'muse_HaHb', 'muse_met_scal', 'muse_EBV'] },
];
export function normalizeTablePreset(id) {
  return TABLE_PRESETS.some(p => p.id === id) ? id : 'global';
}
export function normalizeVisibleColumns(keys, preset = 'global') {
  const defaults = TABLE_PRESETS.find(p => p.id === normalizeTablePreset(preset)).keys;
  return Array.isArray(keys) ? ['name', ...new Set(keys.filter(k => k !== 'name' && byKey.has(k)))] : [...defaults];
}
export function visibleTableColumns(state) {
  const preset = normalizeTablePreset(state.tablePreset);
  return normalizeVisibleColumns(state.tableColumns?.[preset], preset).map(k => byKey.get(k));
}
export function needsMuseMethod(state) {
  return visibleTableColumns(state).some(c => c.group === 'MUSE summaries') ||
    (state.phangs?.columnFilters || []).some(f => byKey.get(f.key)?.group === 'MUSE summaries');
}
export function clearPhangsFilters() {
  return { nameQuery: '', columnFilters: [], surveys: normalizeSurveyFilters({}) };
}
// Fresh visits start with the catalogue; legacy nonempty plot links retain their view.
export function tableLinkState(params) {
  let filters = [], columns;
  try { filters = normalizeColumnFilters(JSON.parse(params.get('phcf') || '[]')); } catch { /* malformed optional state */ }
  try { columns = JSON.parse(params.get('phcols')); } catch { /* default columns */ }
  const tablePreset = normalizeTablePreset(params.get('phg'));
  return { presentation: params.get('phv') === 'table' || !params.toString() ? 'table' : 'plot',
    tablePreset, tableColumns: { [tablePreset]: normalizeVisibleColumns(columns, tablePreset) },
    nameQuery: (params.get('phq') || '').trim(),
    tableSort: normalizeTableSort({ key: params.get('phts'), direction: params.get('phtd') }), columnFilters: filters };
}
