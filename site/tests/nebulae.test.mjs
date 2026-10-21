import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Emitter } from '../js/events.js';
import { Store } from '../js/state.js';
import { Dataset } from '../js/data/loader.js';
import { frameFromCombos } from '../js/math/frame.js';
import { createPhangs, projectPhangs } from '../js/view/overlays/phangs.js';
import { nebulaOptions, nebulaValues, nebulaRow, hasNebulaAxes, NEBULA_KEYS } from '../js/data/nebulae.js';
import { initUrlState } from '../js/ui/urlstate.js';
import { Interaction } from '../js/view/interaction.js';

const read = name => JSON.parse(readFileSync(new URL(name, import.meta.url)));
const manifest = read('../data/manifest.json');
const phangs = read('../data_phangs/phangs.json');
const summary = read('../data_phangs/nebulae_summary.json');
const regions = read('../data_phangs/nebulae_regions.json');
const dims = manifest.dims;
const frame = (x = { logM: 1 }, y = { OH_PP04: 1 }) => frameFromCombos(x, y, dims).F;

function fixture(t, fail = '', regionResponse = regions) {
  class Element {
    constructor() { this.children = []; this.style = {}; this.handlers = {}; this.hidden = false; }
    setAttribute(k, v) { this[k] = v; if (k === 'hidden') this.hidden = true; }
    append(...xs) { this.children.push(...xs); }
    replaceChildren(...xs) { this.children = xs; }
    addEventListener(k, fn) { this.handlers[k] = fn; }
    matches() { return false; }
  }
  const globals = { document: globalThis.document, Node: globalThis.Node };
  globalThis.document = { createElement: () => new Element(), createTextNode: text => ({ textContent: text }) };
  globalThis.Node = Element;
  t.after(() => Object.assign(globalThis, globals));
  const calls = [];
  t.mock.method(globalThis, 'fetch', async url => {
    calls.push(url);
    return { ok: !url.includes(fail || 'never-fail'), status: 404,
      json: async () => url.endsWith('phangs.json') ? phangs : url.endsWith('nebulae_summary.json') ? summary : regionResponse };
  });
  const data = new Dataset(manifest);
  data.loaded = true;
  data.meta = { loaded: true, ra: [], dec: [] };
  const events = new Emitter();
  const selection = { mask: new Uint8Array([1]), count: 1 };
  const store = new Store({ overlays: {}, phangs: {}, selection, tour: { set: ['logM', 'OH_PP04'], speed: 1 },
    filters: { cats: {}, z: null }, render: { gain: 1, pointSize: 2 }, mosaic: { cell: 56, scale: 'fit' } });
  store.subscribe((state, changed) => events.emit('state', { state, changed }));
  let hover, click;
  const app = { data, events, store, frame: frame(), isMoving: () => false,
    layers: { stage: new Element() },
    camera: { width: 1200, toScreen: (x, y) => [500 + 10 * x, 500 - 10 * y], viewBounds: () => [-5, 5, -5, 5] },
    interaction: { clearHover() {}, addHoverHandler(fn) { hover = fn; }, addClickHandler(fn) { click = fn; } },
    filterParams: () => ({}),
    proj: { projectSample: () => ({ X: [0], Y: [0], vis: [1] }) },
    actions: { inspect: index => events.emit('inspect', { index }),
      setOverlay: (name, value) => store.set({ overlays: { [name]: value } }) } };
  const ov = { layer: new Element(), invalidate() {}, plotRect: () => ({ l: 0, t: 0, r: 1200, b: 900 }) };
  let drawn = 0;
  const ctx = { save() {}, restore() {}, beginPath() {}, rect() {}, clip() {}, fillRect() { drawn++; }, arc() {}, stroke() {} };
  const api = createPhangs(app, ov);
  const text = node => [node.textContent || '', ...node.children?.map(text) || []].join(' ');
  return { app, api, ov, ctx, calls, selection, text, hover: point => hover(point), click: point => click(point),
    get drawn() { return drawn; }, get point() {
      const host = phangs.galaxies.find(h => h.name === regions.regions[0].galaxy);
      const row = nebulaRow(host, regions.regions[0]);
      const p = api.project(row);
      const [sx, sy] = app.camera.toScreen(p.X, p.Y);
      return { sx, sy };
    } };
}

test('nebular mapping preserves native definitions, host values and missing coverage', () => {
  const host = phangs.galaxies.find(g => g.name === 'ngc0628');
  const s = summary.galaxies.find(g => g.name === host.name);
  assert.equal(nebulaOptions({ nebulaDisplay: 'invalid', nebulaSummary: 'invalid' }).display, 'summary');
  assert.equal(nebulaOptions({ nebulaDisplay: '__proto__', nebulaSummary: 'toString' }).summary, 'mean');
  const v = nebulaValues(host, host.values, s, 'median');
  assert.equal(v.logM, host.values.logM);
  assert.equal(v.OH_PP04, s.values.median.OH_PP04);
  assert.equal(v.OH, undefined);
  assert.equal(v.AV, undefined);
  assert.equal(nebulaValues(host, host.values, undefined), host.values);
  const r = regions.regions.find(r => r.galaxy === host.name);
  assert.equal(nebulaValues(nebulaRow(host, r), host.values, s).OH_PP04, r.values.OH_PP04);
  assert.ok(hasNebulaAxes(dims, frame()));
  assert.equal(hasNebulaAxes(dims, frame({ logM: 1 }, { logSFR: 1 })), false);
  assert.equal(regions.regions.filter(r => Number.isFinite(r.values.OH_PP04)).length, 23237);
});

test('summaries load without regions; summary changes update inspection without touching SDSS', async t => {
  const f = fixture(t);
  await Promise.all([f.api.ready, f.api.nebulae.ready]);
  assert.equal(f.calls.some(url => url.endsWith('nebulae_regions.json')), false);
  f.api.draw(f.ctx);
  const host = phangs.galaxies.find(g => g.name === 'ngc0628');
  const s = summary.galaxies.find(g => g.name === host.name);
  assert.equal(f.api.values(host).OH_PP04, s.values.mean.OH_PP04);
  let details, refresh = 0;
  f.app.events.on('phangs:inspect', e => { details = e.details; });
  f.app.events.on('phangs:measurements', () => refresh++);
  const markers = f.ov.layer.children[0];
  markers.children.find(el => el['aria-label'] === 'Inspect PHANGS galaxy NGC0628').handlers.click();
  f.app.store.set({ phangs: { nebulaSummary: 'summed' } });
  assert.equal(f.api.values(host).OH_PP04, s.values.summed.OH_PP04);
  assert.match(f.text(details), /Summed lines/);
  assert.match(f.text(details), /Population spread, not measurement uncertainty/);
  assert.match(f.text(details), /native quantities are not derived from summed lines/);
  assert.ok(refresh);
  assert.equal(f.app.data.n, manifest.n);
  assert.equal(f.app.store.get().selection, f.selection);
});

test('full region drawing, projection, picking, filters and display modes', async t => {
  const f = fixture(t);
  await Promise.all([f.api.ready, f.api.nebulae.ready]);
  f.app.frame = frame({ N2Ha: 1 }, { O3Hb: 1 });
  f.app.store.set({ phangs: { nebulaDisplay: 'both' } });
  await f.api.nebulae.loadRegions();
  f.api.draw(f.ctx);
  assert.equal(f.api.nebulae.stats.total, 23244);
  assert.equal(f.api.nebulae.stats.visible, 23244);
  assert.equal(f.drawn, 23244);
  const row = f.api.nebulae.pick(f.point.sx, f.point.sy, .001);
  assert.equal(row.nebula.id, regions.regions[0].id);
  assert.equal(row.name, regions.regions[0].galaxy);
  const direct = projectPhangs(f.api.values(row), dims, f.app.frame);
  assert.deepEqual(f.api.project(row), direct);
  let hovered, inspected;
  f.app.events.on('phangs:hover', e => { hovered = e.row; });
  f.app.events.on('phangs:inspect', e => { inspected = e.row; });
  assert.equal(f.hover(f.point), true);
  assert.ok(hovered.nebula);
  assert.equal(f.click(f.point), true);
  assert.ok(inspected.nebula);
  f.app.store.set({ phangs: { nebulaDisplay: 'regions' } });
  f.api.draw(f.ctx);
  assert.ok(f.ov.layer.children[0].children.slice(1).every(el => el.hidden));
  f.app.frame = frame({ logM: 1 }, { logSFR: 1 });
  f.api.draw(f.ctx);
  assert.equal(f.api.nebulae.stats.visible, 0);
  assert.ok(f.ov.layer.children[0].children.slice(1).some(el => !el.hidden));
  f.app.frame = frame();
  f.app.store.set({ phangs: { surveys: { muse: { status: 'awarded_not_observed' } } } });
  f.api.draw(f.ctx);
  assert.equal(f.api.nebulae.stats.visible, 0);
  assert.equal(f.api.nebulae.pick(f.point.sx, f.point.sy), null);
  assert.equal(f.api.selected, null);
  f.app.store.set({ phangs: { surveys: { muse: null } } });
  f.api.draw(f.ctx);
  assert.equal(f.api.nebulae.stats.visible, 23237);
  f.app.actions.setOverlay('phangs', false);
  f.api.draw(f.ctx);
  assert.equal(f.api.nebulae.stats.visible, 0);
  assert.equal(f.app.store.get().selection, f.selection);
});

test('MUSE load failures stay local to the comparison', async t => {
  for (const file of ['nebulae_summary.json', 'nebulae_regions.json']) {
    await t.test(file, async t => {
      const f = fixture(t, file);
      await Promise.all([f.api.ready, f.api.nebulae.ready]);
      f.app.store.set({ phangs: { nebulaDisplay: 'both' } });
      await f.api.nebulae.loadRegions();
      f.api.draw(f.ctx);
      assert.match(f.text(f.api.nebulae.controls), /unavailable/);
      assert.equal(f.app.data.n, manifest.n);
      assert.equal(f.app.store.get().selection, f.selection);
      if (file.includes('regions')) assert.ok(Number.isFinite(f.api.values(phangs.galaxies.find(g => g.name === 'ngc0628')).OH_PP04));
    });
  }
});

test('shared links restore nebular options and old links retain defaults', async t => {
  const f = fixture(t);
  const globals = { window: globalThis.window, location: globalThis.location, history: globalThis.history };
  globalThis.window = { addEventListener() {} };
  globalThis.location = { hash: '', pathname: '/', search: '' };
  globalThis.history = { replaceState() {} };
  t.after(() => Object.assign(globalThis, globals));
  Object.assign(f.app, { config: { dims: {} }, presetAlignment: () => 0 });
  Object.assign(f.app.actions, { setFrame() {}, setColor: color => f.app.store.set({ color }), setFilter: filters => f.app.store.set({ filters }),
    setMode: mode => f.app.store.set({ mode }), setRender() {}, setMosaic() {}, tour: { setSet() {}, setSpeed() {} } });
  f.app.camera.set = () => {};
  f.app.camera.fitBounds = () => {};
  const url = initUrlState(f.app, {});
  f.app.store.set({ phangs: { nebulaDisplay: 'both', nebulaSummary: 'median' } });
  const encoded = url.encode();
  assert.match(encoded, /phnd=both/);
  assert.match(encoded, /phnm=median/);
  url.restore('#' + encoded);
  assert.deepEqual(nebulaOptions(f.app.store.get().phangs), { display: 'both', summary: 'median' });
  url.restore('#c=-&phnd=bogus&phnm=bogus');
  assert.deepEqual(nebulaOptions(f.app.store.get().phangs), { display: 'summary', summary: 'mean' });
  url.restore('#c=-');
  assert.deepEqual(nebulaOptions(f.app.store.get().phangs), { display: 'summary', summary: 'mean' });
});

test('a mismatched region export cannot be combined with galaxy summaries', async t => {
  const f = fixture(t, '', { ...regions, source_sha256: 'different-source' });
  await Promise.all([f.api.ready, f.api.nebulae.ready]);
  assert.equal(await f.api.nebulae.loadRegions(), null);
  f.app.store.set({ phangs: { nebulaDisplay: 'both' } });
  f.api.draw(f.ctx);
  assert.equal(f.api.nebulae.stats.total, 0);
  assert.ok(Number.isFinite(f.api.values(phangs.galaxies.find(g => g.name === 'ngc0628')).OH_PP04));
});

test('region hover hooks yield to gestures and ordinary SDSS picking', () => {
  const emitted = [];
  const target = { style: {}, addEventListener() {} };
  const app = { events: { emit: (...e) => emitted.push(e) }, isMoving: () => false, proj: { pick: () => 7 } };
  const interaction = new Interaction(app, target);
  const points = [];
  interaction.addHoverHandler(p => { points.push(p); return !!p && p.sx < 10; });
  interaction._lastHoverPos = [5, 5];
  interaction._doHover();
  assert.equal(emitted.length, 0);
  interaction.clearHover();
  assert.equal(points.at(-1), null);
  interaction._lastHoverPos = [20, 20];
  interaction._doHover();
  assert.equal(emitted.at(-1)[1].index, 7);
});

test('pan and lasso gestures never invoke the region click handler', () => {
  let clicks = 0, pan = 0, lasso = 0;
  const target = { style: {}, addEventListener() {}, getBoundingClientRect: () => ({ left: 0, top: 0 }) };
  const app = { events: { emit() {} }, camera: { toData: (x, y) => [x, y], panBy: () => pan++ } };
  const interaction = new Interaction(app, target);
  interaction.addClickHandler(() => { clicks++; return true; }, 30);
  const event = (x, y) => ({ target, pointerId: 1, pointerType: 'mouse', button: 0, clientX: x, clientY: y, preventDefault() {} });
  interaction._onDown(event(5, 5));
  interaction._onMove(event(30, 30));
  interaction._onUp(event(30, 30));
  assert.equal(pan, 1);
  assert.equal(clicks, 0);
  interaction.registerTool('lasso', { onDown() { lasso++; }, onMove() { lasso++; }, onUp() { lasso++; return true; } });
  interaction.setTool('lasso');
  interaction._onDown(event(5, 5));
  interaction._onMove(event(30, 30));
  interaction._onUp(event(30, 30));
  assert.equal(lasso, 3);
  assert.equal(clicks, 0);
});
