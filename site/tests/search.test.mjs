import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Emitter } from '../js/events.js';
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

function fixture(t, { loading = false, missing = false, filtered = false, beforeOverlays = false } = {}) {
  class Element {
    constructor(tag) {
      this.tagName = tag.toUpperCase(); this.children = []; this.handlers = {}; this.style = {};
      this.hidden = false; this.value = ''; this.offsetWidth = 310;
    }
    setAttribute(k, v) { this[k] = v; if (k === 'hidden') this.hidden = true; }
    removeAttribute(k) { delete this[k]; }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    addEventListener(k, f) { (this.handlers[k] ||= []).push(f); }
    dispatch(k, props = {}) {
      const e = { target: this, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {}, ...props };
      for (const fn of this.handlers[k] || []) fn(e);
      return e;
    }
    contains(el) { return el === this || this.children.some(c => c.contains?.(el)); }
    getBoundingClientRect() { return { left: 500, bottom: 40 }; }
    blur() { this.blurred = true; }
  }
  const oldDocument = globalThis.document, oldWindow = globalThis.window, oldNode = globalThis.Node;
  const body = new Element('body');
  globalThis.Node = Element;
  globalThis.document = {
    body, createElement: tag => new Element(tag), createTextNode: text => ({ text }),
    getElementById: id => body.children.find(el => el.id === id), addEventListener() {},
  };
  globalThis.window = { innerWidth: 1280, innerHeight: 988, addEventListener() {} };
  t.after(() => { globalThis.document = oldDocument; globalThis.window = oldWindow; globalThis.Node = oldNode; });
  const catalogue = { galaxies: rows };
  const state = { phangs: { surveys: filtered ? { alma: { status: 'observed' } } : {} }, overlays: { phangs: false } };
  const inspected = [], pans = [], changed = [];
  const app = {
    data: { loaded: true }, events: new Emitter(), store: { get: () => state },
    overlays: { phangs: { catalogue: loading ? null : catalogue,
      project: () => ({ X: 1.5, Y: -.25, vis: missing ? 0 : 1 }), inspect: row => inspected.push(row) } },
    actions: { setOverlay: (name, on) => { state.overlays[name] = on; changed.push([name, on]); } },
    camera: { set: (...args) => pans.push(args) },
  };
  if (beforeOverlays) delete app.overlays;
  const mount = new Element('div');
  const api = initGalaxySearch(app, mount, { closeMenus() {} });
  const panel = body.children[0].children[0], list = panel.children[2], status = panel.children[1];
  return { app, api, panel, list, status, state, changed, inspected, pans, catalogue };
}

test('header search initialises before the overlays and accepts the later catalogue event', t => {
  const f = fixture(t, { beforeOverlays: true });
  assert.equal(f.api.input.placeholder, 'Search galaxy…');
  f.api.input.dispatch('focus');
  assert.match(f.status.textContent, /Loading PHANGS/);
  f.app.overlays = { phangs: { project: () => ({ X: 1, Y: 2, vis: 1 }) } };
  f.app.events.emit('phangs:ready', f.catalogue);
  f.api.input.value = 'NGC 628';
  f.api.input.dispatch('input');
  assert.equal(f.list.children.length, 1);
});

test('search exposes loading, unavailable and no-match states', t => {
  const f = fixture(t, { loading: true });
  f.api.input.dispatch('focus');
  assert.match(f.status.textContent, /Loading PHANGS/);
  f.app.events.emit('phangs:ready', null);
  assert.match(f.status.textContent, /unavailable/);
  f.app.events.emit('phangs:ready', f.catalogue);
  f.api.input.value = 'NoSuchGalaxy';
  f.api.input.dispatch('input');
  assert.equal(f.status.textContent, 'No matching PHANGS galaxies.');
  assert.equal(f.list.children.length, 0);
  assert.equal(f.api.input['aria-expanded'], 'true');
  assert.equal(f.api.close(), true);
  assert.equal(f.api.close(), false);
  assert.equal(f.api.input['aria-expanded'], 'false');
});

test('keyboard search navigates results and inspects/recentres without changing axes or filters', t => {
  const f = fixture(t);
  const originalFilters = f.state.phangs.surveys;
  f.api.input.value = 'ngc';
  f.api.input.dispatch('input');
  f.api.input.dispatch('keydown', { key: 'ArrowDown' });
  assert.equal(f.api.input['aria-activedescendant'], 'galaxy-search-result-0');
  f.api.input.dispatch('keydown', { key: 'ArrowDown' });
  assert.equal(f.api.input['aria-activedescendant'], 'galaxy-search-result-1');
  f.api.input.dispatch('keydown', { key: 'ArrowUp' });
  f.api.input.dispatch('keydown', { key: 'Enter' });
  assert.deepEqual(f.inspected, [rows[0]]);
  assert.deepEqual(f.changed, [['phangs', true]]);
  assert.deepEqual(f.pans[0][0], { cx: 1.5, cy: -.25 });
  assert.equal(f.state.phangs.surveys, originalFilters);
  assert.equal(f.panel.hidden, true);
  assert.equal(f.api.input.blurred, true);
});

test('filtered results remain findable and inspectable with an explicit label, without panning', t => {
  const f = fixture(t, { filtered: true });
  f.api.input.value = 'NGC 629';
  f.api.input.dispatch('input');
  assert.match(f.list.children[0].children.at(-1).textContent, /Hidden by observation filters/);
  f.list.children[0].dispatch('click');
  assert.deepEqual(f.inspected, [rows[1]]);
  assert.equal(f.pans.length, 0);
  assert.ok(f.state.phangs.surveys.alma);
});

test('missing axes are labelled and never recentered; Escape closes the results', t => {
  const f = fixture(t, { missing: true });
  f.api.input.value = 'ngc628';
  f.api.input.dispatch('input');
  assert.match(f.list.children[0].children.at(-1).textContent, /Unavailable on current axes/);
  f.api.input.dispatch('keydown', { key: 'Enter' });
  assert.equal(f.pans.length, 0);
  f.api.input.dispatch('focus');
  const e = f.api.input.dispatch('keydown', { key: 'Escape' });
  assert.equal(f.panel.hidden, true);
  assert.equal(e.defaultPrevented, true);
  f.app.overlays.phangs.project = () => ({ X: 1, Y: 2, vis: .5 });
  assert.match(galaxySearchStatus(f.app, rows[0]).text, /Faded/);
});
