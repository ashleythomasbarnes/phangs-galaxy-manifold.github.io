import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PHANGS_COLUMNS, formatCell, missing, normalizeColumnFilters, normalizeTableSort,
  matchesPhangsSelection, sortPhangsRows, tableLinkState } from '../js/data/phangs-table.js';
import { projectPhangs } from '../js/view/overlays/phangs.js';
import { frameFromCombos } from '../js/math/frame.js';

const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url)));
const catalogue = read('../data_phangs/phangs.json');
const summaries = read('../data_phangs/nebulae_summary.json');
const summaryMap = new Map(summaries.galaxies.map(r => [r.name, r]));
const ctx = { summary: name => summaryMap.get(name), method: 'mean', museReady: true };
const rows = [
  { name: 'ngc10', values: { logM: 10.00004, logSFR: 0 }, source: { morph_string: 'Sb', survey_alma_status: 'released' } },
  { name: 'ngc2', values: { logM: 10, logSFR: -1 }, source: { morph_string: 'Sc', survey_alma_status: 'not_in_survey' } },
  { name: 'IC1', values: { logM: null }, source: {} },
];
const select = filters => rows.filter(r => matchesPhangsSelection(r, { columnFilters: normalizeColumnFilters(filters) }));

test('numeric column filters use inclusive raw bounds, zero and negatives', () => {
  assert.deepEqual(select([{ key: 'logM', min: 10, max: 10 }]).map(r => r.name), ['ngc2']);
  assert.deepEqual(select([{ key: 'logM', min: 10.00001 }]).map(r => r.name), ['ngc10']);
  assert.deepEqual(select([{ key: 'logSFR', min: 0, max: 0 }]).map(r => r.name), ['ngc10']);
  assert.deepEqual(select([{ key: 'logSFR', max: -0.5 }]).map(r => r.name), ['ngc2']);
});

test('text, categorical OR, cross-column AND and survey filters compose', () => {
  assert.equal(select([{ key: 'name', text: 'NgC' }]).length, 2);
  assert.equal(select([{ key: 'morph_string', values: ['Sb', 'Sc'] }]).length, 2);
  assert.deepEqual(select([{ key: 'name', text: 'NGC' }, { key: 'morph_string', values: ['Sc'] }]).map(r => r.name), ['ngc2']);
  const state = { surveys: { alma: { program: 'nominal', status: 'observed', array: 'any' } }, columnFilters: [{ key: 'logM', max: 10 }] };
  assert.equal(rows.filter(r => matchesPhangsSelection(r, state)).length, 0);
  assert.equal(rows.filter(r => matchesPhangsSelection(r, { ...state, columnFilters: [] })).length, 1);
});

test('missing and present are explicit and missing measurements stay out of value filters', () => {
  assert.deepEqual(select([{ key: 'logM', presence: 'missing' }]).map(r => r.name), ['IC1']);
  assert.equal(select([{ key: 'logM', presence: 'present' }]).length, 2);
  for (const value of [null, undefined, '', ' ', NaN, Infinity]) assert.equal(missing(value), true);
  assert.equal(missing(0), false);
  const dense = PHANGS_COLUMNS.find(c => c.key === 'overview_dense_gas_surveys');
  assert.equal(missing(dense.value({ morphology_overview: { dense_gas_surveys: [] } })), true);
  assert.equal(dense.value({ morphology_overview: { dense_gas_surveys: ['A', 'B'] } }), 'A, B');
});

test('sort uses natural names, numeric raw values, name tie-breakers and missing last both ways', () => {
  assert.deepEqual(sortPhangsRows(rows).map(r => r.name), ['IC1', 'ngc2', 'ngc10']);
  assert.deepEqual(sortPhangsRows(rows, { key: 'logM' }).map(r => r.name), ['ngc2', 'ngc10', 'IC1']);
  assert.deepEqual(sortPhangsRows(rows, { key: 'logM', direction: 'desc' }).map(r => r.name), ['ngc10', 'ngc2', 'IC1']);
  const ties = rows.map(r => ({ ...r, values: { logM: 10 } }));
  assert.deepEqual(sortPhangsRows(ties, { key: 'logM', direction: 'desc' }).map(r => r.name), ['IC1', 'ngc2', 'ngc10']);
  assert.deepEqual(rows.map(r => r.name), ['ngc10', 'ngc2', 'IC1']);
});

test('registry covers exported science fields without duplicating metadata columns', () => {
  const keys = PHANGS_COLUMNS.map(c => c.key);
  assert.equal(new Set(keys).size, keys.length);
  const metadata = /(_unc|_method|_ref|_references|_notes)$/;
  const context = new Set(['name', 'alias', 'orient_ra', 'orient_dec', 'dist_label', 'morph_comments']);
  for (const key of Object.keys(catalogue.galaxies[0].source)) {
    if (!metadata.test(key) && !context.has(key)) assert.ok(keys.includes(key) || keys.includes(`${key}_arcsec`), key);
  }
  for (const row of catalogue.galaxies) for (const col of PHANGS_COLUMNS) {
    const v = col.value(row, ctx);
    assert.ok(missing(v) || ['number', 'string'].includes(typeof v), col.key);
    assert.equal(typeof formatCell(col, v), 'string');
    assert.equal(typeof col.detail(row, ctx), 'string');
  }
});

test('MUSE columns follow summary method and native quantities retain the mean fallback for summed lines', () => {
  const row = catalogue.galaxies.find(r => r.name === 'ngc0628'), summary = summaryMap.get(row.name);
  const oxygen = PHANGS_COLUMNS.find(c => c.key === 'muse_OH_PP04');
  const native = PHANGS_COLUMNS.find(c => c.key === 'muse_met_scal');
  for (const method of ['mean', 'median', 'summed']) {
    const context = { ...ctx, method };
    assert.equal(oxygen.value(row, context), summary.values[method].OH_PP04);
    assert.equal(native.value(row, context), summary.native.met_scal[method === 'median' ? 'median' : 'mean']);
  }
  const a = summary.values.mean.OH_PP04, b = summary.values.summed.OH_PP04;
  const state = { columnFilters: [{ key: 'muse_OH_PP04', min: (a + b) / 2 }] };
  assert.equal(matchesPhangsSelection(row, state, ctx), a > b);
  assert.equal(matchesPhangsSelection(row, state, { ...ctx, method: 'summed' }), b > a);
  assert.equal(matchesPhangsSelection(row, state, { ...ctx, museReady: false }), false);
  assert.equal(matchesPhangsSelection(row, { columnFilters: [{ key: 'muse_OH_PP04', presence: 'missing' }] }, { ...ctx, museReady: false }), false);
});

test('selection includes catalogue galaxies unavailable on current axes', () => {
  const dims = read('../data/manifest.json').dims;
  const F = frameFromCombos({ logM: 1 }, { logSFR: 1 }, dims).F;
  const row = catalogue.galaxies.find(r => projectPhangs(r.values, dims, F).vis < .01);
  assert.ok(row);
  assert.equal(matchesPhangsSelection(row, {}), true);
});

test('link defaults and malformed or unknown optional table settings are safe', () => {
  assert.deepEqual(tableLinkState(new URLSearchParams()), { presentation: 'plot', tableSort: { key: 'name', direction: 'asc' }, columnFilters: [] });
  const filters = [{ key: 'logM', min: 10 }, { key: 'morph_string', values: ['Sb', 'Sc'] }, { key: 'name', text: 'ngc&x:=' }];
  const params = new URLSearchParams({ phv: 'table', phts: 'logM', phtd: 'desc', phcf: JSON.stringify(filters) });
  assert.deepEqual(tableLinkState(new URLSearchParams(params.toString())), { presentation: 'table', tableSort: { key: 'logM', direction: 'desc' }, columnFilters: filters });
  for (const value of ['bad JSON', '{}', 'null', '[null,{}, {"key":"__proto__"}]']) assert.deepEqual(tableLinkState(new URLSearchParams({ phcf: value })).columnFilters, []);
  assert.deepEqual(normalizeColumnFilters([{ key: 'logM', min: 11, max: 9 }, { key: 'name', text: ' ' }, { key: 'logM', min: Infinity }]), []);
  assert.deepEqual(normalizeTableSort({ key: '__proto__', direction: 'bad' }), { key: 'name', direction: 'asc' });
});


test('table formatting keeps tiny and very large science values readable', () => {
  const mass = PHANGS_COLUMNS.find(c => c.key === 'props_mstar');
  assert.match(formatCell(mass, 3.39e10), /e\+10$/);
  assert.match(formatCell(mass, 8.68e37), /e\+37$/);
  assert.match(formatCell(mass, 1e-8), /e-8$/);
  assert.equal(formatCell(mass, 0), '0');
  assert.equal(formatCell(mass, null), '—');
});
