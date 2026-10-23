import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Emitter } from '../js/events.js';
import { Store } from '../js/state.js';
import { matchesPhangsSelection } from '../js/data/phangs-table.js';
import { normalizeGalaxyName, searchGalaxyNames, galaxySearchStatus, initGalaxySearch } from '../js/ui/search.js';

const rows = [
  { name: 'ngc0628', source: { alias: 'M74;UGC01149', survey_alma_status: 'released' } },
  { name: 'ngc0629', source: { alias: 'UGC01150', survey_alma_status: 'not_in_survey' } },
  { name: 'ic0628', source: {} },
];

test('PHANGS name search ignores case, whitespace and catalogue zero padding', () => {
  assert.equal(normalizeGalaxyName(' NGC 0628 '), 'ngc628');
  assert.equal(normalizeGalaxyName('ngc628'), 'ngc628');
  assert.equal(normalizeGalaxyName('PGC00012345678901234567890'), 'pgc12345678901234567890');
  for (const q of ['NGC 628', 'ngc0628', ' NgC 00628 ']) assert.equal(searchGalaxyNames(rows, q)[0].row, rows[0]);
  assert.deepEqual(searchGalaxyNames(rows, '  '), []);
  assert.deepEqual(searchGalaxyNames(rows, 'not-in-catalogue'), []);
});

test('PHANGS search includes supplied aliases, with one result per host and exact matches first', () => {
  assert.equal(searchGalaxyNames(rows, 'M 74')[0].row, rows[0]);
  assert.equal(searchGalaxyNames(rows, 'ugc1149')[0].alias, 'UGC01149');
  assert.equal(searchGalaxyNames(rows, '628').length, 2);
  assert.equal(searchGalaxyNames(rows, 'ngc')[0].row, rows[0]);
  assert.equal(searchGalaxyNames([{ name: 'm74', source: {} }, ...rows], 'm74')[0].row.name, 'm74');
});

test('real PHANGS catalogue resolves NGC 628 and its catalogue alias', () => {
  const catalogue = JSON.parse(readFileSync(new URL('../data_phangs/phangs.json', import.meta.url)));
  const canonical = searchGalaxyNames(catalogue.galaxies, 'NGC 0628');
  assert.equal(canonical.length, 1);
  assert.equal(canonical[0].row.name, 'ngc0628');
  assert.equal(searchGalaxyNames(catalogue.galaxies, 'UGC 1149')[0].row, canonical[0].row);
});

function fixture(t) {
  class Element {
    constructor(tag) { this.tagName = tag; this.value = ''; this.children = []; this.handlers = {}; }
    setAttribute(k, v) { this[k] = v; }
    append(...children) { this.children.push(...children); }
    addEventListener(k, f) { this.handlers[k] = f; }
    focus() { this.focused = true; }
  }
  const globals = { document: globalThis.document, Node: globalThis.Node };
  globalThis.Node = Element;
  globalThis.document = { createElement: tag => new Element(tag), createTextNode: text => ({ text }) };
  t.after(() => Object.assign(globalThis, globals));
  const events = new Emitter(), store = new Store({ presentation: 'table', phangs: { nameQuery: '', surveys: {}, columnFilters: [] } });
  store.subscribe((state, changed) => events.emit('state', { state, changed }));
  const app = { events, store, data: { loaded: true } };
  const api = initGalaxySearch(app, new Element('div'), { closeMenus() {} });
  return { app, api, store, selected: () => rows.filter(r => matchesPhangsSelection(r, store.get().phangs)) };
}

test('name filter initialises before data and immediately refines the shared sample', t => {
  const f = fixture(t);
  assert.equal(f.api.input.placeholder, 'Filter name or alias…');
  f.api.input.value = 'NGC 00628'; f.api.input.handlers.input();
  assert.deepEqual(f.selected().map(r => r.name), ['ngc0628']);
  f.store.set({ presentation: 'plot' });
  assert.deepEqual(f.selected().map(r => r.name), ['ngc0628']);
  f.api.input.value = 'UGC 1150'; f.api.input.handlers.input();
  assert.deepEqual(f.selected().map(r => r.name), ['ngc0629']);
});

test('name search composes with surveys, zero results and clearing without resetting other filters', t => {
  const f = fixture(t);
  f.store.set({ phangs: { surveys: { alma: { status: 'observed' } } } });
  f.api.input.value = '629'; f.api.input.handlers.input();
  assert.equal(f.selected().length, 0);
  f.api.input.value = ''; f.api.input.handlers.input();
  assert.equal(f.selected().length, 1);
  assert.ok(f.store.get().phangs.surveys.alma);
  f.api.input.value = 'NoSuchGalaxy'; f.api.input.handlers.input();
  assert.equal(f.selected().length, 0);
});

test('restoring or removing a name filter synchronises the header field and focus', t => {
  const f = fixture(t);
  f.store.set({ phangs: { nameQuery: 'M 74' } });
  assert.equal(f.api.input.value, 'M 74');
  assert.deepEqual(f.selected().map(r => r.name), ['ngc0628']);
  f.store.set({ phangs: { nameQuery: '' } });
  assert.equal(f.api.input.value, '');
  assert.equal(f.selected().length, rows.length);
  f.api.focus(); assert.equal(f.api.input.focused, true);
});

test('search status distinguishes property/survey exclusions and missing plot axes', t => {
  const f = fixture(t);
  f.app.overlays = { phangs: { project: () => ({ X: 1, Y: 2, vis: 0 }) } };
  assert.match(galaxySearchStatus(f.app, rows[0]).text, /Unavailable on current axes/);
  f.store.set({ phangs: { surveys: { alma: { status: 'observed' } } } });
  assert.match(galaxySearchStatus(f.app, rows[1]).text, /Hidden by observation filters/);
  f.store.set({ phangs: { nameQuery: 'OtherName' } });
  assert.match(galaxySearchStatus(f.app, rows[0]).text, /Hidden by PHANGS filters/);
});
