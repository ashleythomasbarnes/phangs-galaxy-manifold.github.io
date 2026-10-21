import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { projectPhangs, createPhangs } from '../js/view/overlays/phangs.js';
import { Store } from '../js/state.js';
import { Emitter } from '../js/events.js';
import { Dataset } from '../js/data/loader.js';
import { ProjectionCache } from '../js/view/projection.js';
import { Camera } from '../js/view/camera.js';
import { phangsImageField, phangsImageUrl, phangsValues } from '../js/data/phangs.js';
import { PHANGS_SURVEYS, almaArray, surveyStatus, matchesSurvey, normalizeSurveyFilters, matchesPhangsSurveys } from '../js/data/surveys.js';
import { basisFrame, frameFromCombos } from '../js/math/frame.js';

const manifest = JSON.parse(readFileSync(new URL('../data/manifest.json', import.meta.url)));
const phangs = JSON.parse(readFileSync(new URL('../data_phangs/phangs.json', import.meta.url)));
const dims = manifest.dims, D = dims.length;
const frame = (x, y) => frameFromCombos(x, y, dims).F;

test('PHANGS export contains all entries and only supported axes', () => {
  assert.equal(phangs.galaxies.length, 118);
  assert.equal(new Set(phangs.galaxies.map(r => r.name)).size, 118);
  for (const r of phangs.galaxies) assert.deepEqual(Object.keys(r.values).sort(), ['logM', 'logSFR', 'logSigma', 'logfHI', 'logsSFR']);
});

test('PHANGS aligns with SDSS projection, within SDSS quantization precision', () => {
  const data = new Dataset({ ...manifest, n: 1 });
  const values = { logM: 10, logSFR: 0.5, logsSFR: -9.5, logfHI: -1, logSigma: 8.5 };
  data.raw = data.dims.map(d => new Uint16Array([Number.isFinite(values[d.key]) ? Math.round((values[d.key] - d.min) / d.step) + 1 : 0]));
  const proj = new ProjectionCache({ camera: new Camera() });
  // A single-row CPU context avoids worker/DOM setup.
  proj.ctx = { D, raw: data.raw, ua: data.dims.map(d => d.ua), ub: data.dims.map(d => d.ub), cats: [] };
  for (const F of [frame({ logM: 1 }, { logSFR: 1 }), frame({ logM: 1 }, { logsSFR: 1 }), frame({ logM: 1 }, { logfHI: 1 }), frame({ logSigma: 1 }, { logsSFR: 1 }), frame({ logM: 1, logSFR: -0.3 }, { logfHI: 1 })]) {
    const p = projectPhangs(values, dims, F), q = proj.projectSample([0], F);
    assert.ok(Math.abs(p.X - q.X[0]) < 0.001);
    assert.ok(Math.abs(p.Y - q.Y[0]) < 0.001);
    assert.equal(p.vis, q.vis[0]);
  }
});

test('R90 densities project on the surface-density view and missing radii hide points', () => {
  const F = frame({ logSigma: 1 }, { logsSFR: 1 });
  const rows = phangs.galaxies.filter(r => Number.isFinite(r.values.logSigma));
  assert.equal(rows.length, 112);
  for (const r of rows) {
    const expected = Math.log10(r.source.props_mstar / (Math.PI * r.sizes.size_r90.kpc ** 2));
    assert.ok(Math.abs(r.values.logSigma - expected) < 1e-12);
    assert.equal(projectPhangs(phangsValues(r), dims, F).vis, 1);
    assert.equal(phangsValues(r, 'ned-exponential').logSigma, r.values.logSigma);
  }
  const missing = phangs.galaxies.filter(r => !Number.isFinite(r.values.logSigma));
  assert.equal(missing.length, 6);
  for (const r of missing) assert.equal(projectPhangs(phangsValues(r), dims, F).vis, 0);
});

test('unsupported axes hide points, intermediate rotations fade, missing values stay missing', () => {
  const values = { logM: 10, logSFR: 0 };
  const F = frame({ logM: 1 }, { logSFR: 1 });
  assert.equal(projectPhangs(values, dims, F).vis, 1);
  assert.equal(projectPhangs({ logM: 10, logSFR: null }, dims, F).vis, 0);
  const missing = dims.findIndex(d => d.key === 'OH');
  const x = dims.findIndex(d => d.key === 'logM');
  assert.equal(projectPhangs(values, dims, basisFrame(D, x, missing)).vis, 0);
  F[missing] = .06;
  assert.ok(Math.abs(projectPhangs(values, dims, F).vis - .5) < 1e-6);
});

// Small DOM fixture for overlay lifecycle tests; no browser/WebGL or new dependencies.
function overlayFixture(t, response = phangs) {
  class Element {
    constructor() { this.children = []; this.style = {}; this.handlers = {}; this.hidden = false; }
    setAttribute(k, v) { this[k] = v; if (k === 'hidden') this.hidden = true; }
    append(...xs) { this.children.push(...xs); }
    replaceChildren(...xs) { this.children = xs; }
    addEventListener(k, f) { this.handlers[k] = f; }
    matches() { return false; }
  }
  const oldDocument = globalThis.document, oldNode = globalThis.Node;
  globalThis.document = { createElement: () => new Element(), createTextNode: text => ({ text }) };
  globalThis.Node = Element;
  t.after(() => { globalThis.document = oldDocument; globalThis.Node = oldNode; });
  t.mock.method(globalThis, 'fetch', async () => response ? { ok: true, json: async () => response } : { ok: false, status: 404 });
  const selection = { mask: new Uint8Array([1]), count: 1 };
  const state = { overlays: {}, selection };
  const data = new Dataset(manifest);
  data.loaded = true;
  data.meta = { loaded: true, ra: [], dec: [] };
  for (const r of phangs.galaxies) for (const c of r.match.candidates) {
    data.meta.ra[c.index] = c.ra;
    data.meta.dec[c.index] = c.dec;
  }
  data.value = () => 10;
  let cpVisible = 1;
  const app = { data, frame: frame({ logM: 1 }, { logSFR: 1 }), events: new Emitter(),
    store: { get: () => state, set: patch => { Object.assign(state, patch); app.events.emit('state', { changed: Object.keys(patch) }); } }, layers: { stage: new Element() },
    camera: { width: 1200, toScreen: () => [200, 200] }, isMoving: () => false,
    interaction: { clearHover() {} }, filterParams: () => ({}),
    proj: { projectSample: () => ({ X: [1], Y: [2], vis: [cpVisible] }) },
    actions: { inspect: index => app.events.emit('inspect', { index }),
      setOverlay: (key, value) => { state.overlays[key] = value; app.events.emit('state', { changed: ['overlays'] }); } } };
  const ov = { layer: new Element(), invalidate() {}, plotRect: () => ({ l: 0, r: 1200, t: 0, b: 900 }) };
  return { app, ov, selection, setVisible(v) { cpVisible = v; } };
}

test('inspection, filters and toggling never modify SDSS rows or lasso selection', async t => {
  const f = overlayFixture(t), api = createPhangs(f.app, f.ov);
  let counts;
  f.app.events.on('phangs:count', stats => { counts = stats; });
  await api.ready;
  api.draw();
  assert.equal(counts.visible, 116);
  assert.equal(counts.total, 118);
  const [markers, controls] = f.ov.layer.children;
  let details;
  f.app.events.on('phangs:inspect', event => { details = event.details; });
  markers.children.find(el => el['aria-label'] === 'Inspect PHANGS galaxy NGC1087').handlers.click();
  api.draw();
  assert.equal(api.selected, 'ngc1087');
  assert.equal(details.hidden, false);
  assert.equal(markers.children[0].hidden, false);
  assert.deepEqual(api.counterpartPoint, { X: 1, Y: 2 });
  f.setVisible(0);
  api.draw();
  assert.equal(markers.children[0].hidden, true);
  assert.equal(f.app.data.n, manifest.n);
  assert.equal(f.app.store.get().selection, f.selection);
  const toggle = controls.children[0].children[0];
  toggle.checked = false;
  toggle.handlers.change();
  api.draw();
  assert.equal(api.selected, null);
  assert.equal(counts.visible, 0);
  assert.equal(api.counterpartPoint, null);
  assert.equal(details.hidden, true);
  assert.ok(markers.children.every(el => el.hidden));
  assert.equal(f.app.store.get().selection, f.selection);
});

test('missing PHANGS file remains local to the overlay', async t => {
  const f = overlayFixture(t, null), api = createPhangs(f.app, f.ov);
  assert.equal(await api.ready, null);
  assert.doesNotThrow(() => api.draw());
  const controls = f.ov.layer.children[1];
  assert.equal(controls.children[0].children[0].disabled, true);
  assert.match(controls.children[2].textContent, /PHANGS unavailable/);
  assert.equal(f.app.data.n, manifest.n);
  assert.equal(f.app.store.get().selection, f.selection);
});

test('size comparison changes are explicit and notify the inspector', async t => {
  const f = overlayFixture(t), api = createPhangs(f.app, f.ov);
  await api.ready;
  let mode;
  f.app.events.on('phangs:size', event => { mode = event.mode; });
  const controls = f.ov.layer.children[1];
  const select = controls.children[3].children[1];
  assert.equal(api.sizeMode, 'none');
  select.value = 'ned-exponential';
  select.handlers.change();
  api.draw();
  assert.equal(api.sizeMode, 'ned-exponential');
  assert.equal(mode, 'ned-exponential');
  assert.equal(controls.children[4].hidden, false);
  assert.equal(f.app.store.get().selection, f.selection);
  assert.equal(f.app.data.n, manifest.n);
});

test('SDSS cutouts use PHANGS coordinates and an angular field covering the galaxy', () => {
  const row = phangs.galaxies.find(r => r.name === 'ngc0628');
  assert.equal(phangsImageField(row), row.source.size_r25 * 2.4);
  const url = new URL(phangsImageUrl(row, 128, 'sdss'));
  assert.equal(url.searchParams.get('layer'), 'sdss');
  assert.equal(url.searchParams.get('size'), '128');
  assert.ok(Math.abs(+url.searchParams.get('pixscale') * 128 - phangsImageField(row)) < .001);
  assert.equal(phangsImageField({ source: {} }), 240);
  assert.equal(phangsImageUrl({ ra: null, dec: 0 }), null);
});

test('PHANGS defaults to DSS2 colour; DESI DR10 has the same angular field', () => {
  const row = phangs.galaxies.find(r => r.name === 'ngc1087');
  const dss = new URL(phangsImageUrl(row));
  assert.equal(dss.hostname, 'alasky.cds.unistra.fr');
  assert.equal(dss.searchParams.get('hips'), 'CDS/P/DSS2/color');
  assert.equal(dss.searchParams.get('width'), '256');
  assert.equal(dss.searchParams.get('projection'), 'TAN');
  assert.equal(+dss.searchParams.get('fov') * 3600, phangsImageField(row));
  const desi = new URL(phangsImageUrl(row, 256, 'ls-dr10'));
  assert.equal(desi.searchParams.get('layer'), 'ls-dr10');
  assert.ok(Math.abs(+desi.searchParams.get('pixscale') * 256 - phangsImageField(row)) < .001);
});

test('NED radius mode only maps measured model sizes and leaves source data intact', () => {
  const row = { values: { logM: 10, logSFR: 0 }, ned_exponential_size: { kpc: 2 } };
  assert.equal(phangsValues(row), row.values);
  assert.deepEqual(phangsValues(row, 'ned-exponential'), { logM: 10, logSFR: 0, logR50: Math.log10(2) });
  assert.equal(row.values.logR50, undefined);
  assert.equal(phangsValues({ values: {}, ned_exponential_size: null }, 'ned-exponential').logR50, null);
  const F = frame({ logM: 1 }, { logR50: 1 });
  assert.equal(projectPhangs(phangsValues(row), dims, F).vis, 0);
  assert.equal(projectPhangs(phangsValues(row, 'ned-exponential'), dims, F).vis, 1);
});


test('survey coverage uses observed status and recorded array combinations', () => {
  const survey = id => PHANGS_SURVEYS.find(s => s.id === id);
  const count = (id, filter) => phangs.galaxies.filter(r => matchesSurvey(r, survey(id), filter)).length;
  assert.equal(count('alma'), 90);
  assert.equal(count('alma', { status: 'observed', array: 'full' }), 80);
  assert.equal(count('alma', { status: 'observed', array: 'compact' }), 10);
  assert.equal(count('alma', { status: 'released', array: 'full' }), 79);
  assert.equal(count('muse'), 19);
  assert.equal(count('hst'), 25);
  assert.equal(count('hst', { status: 'awarded_not_observed' }), 12);
  assert.equal(count('vla'), 66);
  assert.equal(count('meerkat'), 5);
  const row = { source: { survey_alma_instrument: 'TP;12m;7m', survey_alma_status: 'awarded_not_observed' } };
  assert.equal(almaArray(row), 'full');
  assert.equal(matchesSurvey(row, survey('alma')), false);
  assert.equal(almaArray({ source: { survey_alma_instrument: '12m' } }), null);
  const both = { source: { survey_hi_instrument: 'VLA & MeerKAT', survey_hi_status: 'released' } };
  assert.equal(surveyStatus(both, survey('vla')), 'released');
  assert.equal(surveyStatus(both, survey('meerkat')), 'released');
  assert.equal(surveyStatus({ source: { survey_hi_instrument: 'ATCA', survey_hi_status: 'released' } }, survey('vla')), null);
  assert.equal(surveyStatus(both, survey('jwst')), null);
});

test('survey filters intersect, validate linked choices and clear through the store merge', () => {
  const filters = normalizeSurveyFilters({ alma: { status: 'observed', array: 'full' }, muse: { status: 'observed' },
    jwst: { status: 'observed' }, chandra: { status: 'released' }, hst: { status: 'invented' }, unknown: { status: 'observed' } });
  assert.equal(phangs.galaxies.filter(r => matchesPhangsSurveys(r, filters)).length, 19);
  assert.equal(filters.jwst, null);
  assert.equal(filters.chandra, null);
  assert.equal(filters.hst, null);
  assert.equal(filters.unknown, undefined);
  assert.equal(normalizeSurveyFilters({ alma: { status: 'observed', array: 'invented' } }).alma.array, 'any');
  const store = new Store({ phangs: { sizeMode: 'ned-exponential', surveys: filters } });
  store.set({ phangs: { surveys: normalizeSurveyFilters() } });
  assert.equal(store.get().phangs.sizeMode, 'ned-exponential');
  assert.equal(phangs.galaxies.filter(r => matchesPhangsSurveys(r, store.get().phangs.surveys)).length, 118);
});

test('survey filters hide only PHANGS markers and close an excluded inspected galaxy', async t => {
  const f = overlayFixture(t), api = createPhangs(f.app, f.ov);
  let counts;
  f.app.events.on('phangs:count', stats => { counts = stats; });
  await api.ready;
  api.draw();
  const markers = f.ov.layer.children[0];
  markers.children.find(el => el['aria-label'] === 'Inspect PHANGS galaxy NGC3489').handlers.click();
  assert.equal(api.selected, 'ngc3489');
  f.app.store.set({ phangs: { surveys: { alma: { status: 'observed', array: 'full' } } } });
  api.draw();
  assert.equal(api.selected, null);
  assert.equal(counts.matching, 80);
  assert.equal(counts.visible, 80);
  assert.equal(markers.children.find(el => el['aria-label'] === 'Inspect PHANGS galaxy NGC3489').hidden, true);
  assert.equal(f.app.data.n, manifest.n);
  assert.equal(f.app.store.get().selection, f.selection);
  f.app.store.set({ phangs: { surveys: { alma: null, muse: { status: 'awarded_not_observed' } } } });
  api.draw();
  assert.equal(counts.matching, 0);
  assert.equal(counts.visible, 0);
  assert.match(f.ov.layer.children[1].children[2].textContent, /No PHANGS galaxies match/);
  f.app.store.set({ phangs: { surveys: {} } });
  api.draw();
  assert.equal(counts.matching, 118);
});
