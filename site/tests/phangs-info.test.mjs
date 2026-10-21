import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Emitter } from '../js/events.js';
import { initPhangsInfo, phangsSurveyEntries } from '../js/ui/phangs-info.js';

const phangs = JSON.parse(readFileSync(new URL('../data_phangs/phangs.json', import.meta.url)));

test('PHANGS information decodes every recorded v1p6 survey status', () => {
  assert.equal(phangs.galaxies.length, 118);
  for (const row of phangs.galaxies) {
    const entries = phangsSurveyEntries(row);
    const keys = Object.keys(row.source).filter(k => k.startsWith('survey_') && k.endsWith('_status'));
    assert.equal(entries.length, keys.length);
    assert.ok(entries.every(s => !s.status.includes('_')));
    for (const entry of entries) assert.equal(entry.instrument, row.source[`survey_${entry.id}_instrument`] || '');
    assert.ok(!entries.some(s => s.id === 'jwst' || s.id === 'chandra'));
  }
});

test('PHANGS information distinguishes unrecorded and not-observed statuses', () => {
  const entries = phangsSurveyEntries({ source: {
    survey_alma_status: 'awarded_not_observed', survey_muse_status: 'observed_not_released',
    survey_hst_status: 'not_in_survey', survey_hi_status: null,
  } });
  assert.deepEqual(entries.map(s => s.status), [
    'Awarded, not yet observed', 'Observed, awaiting release', 'Outside this survey', 'Not recorded',
  ]);
});

function fixture(t, overlays) {
  class Element {
    constructor(tag) {
      this.tagName = tag.toUpperCase(); this.children = []; this.handlers = {}; this.style = {};
      this.hidden = false; this.value = ''; this.className = ''; this.isConnected = true;
      this.classList = {
        contains: value => this.className.split(/\s+/).includes(value),
        add: value => { if (!this.classList.contains(value)) this.className += ` ${value}`; },
        remove: value => { this.className = this.className.split(/\s+/).filter(s => s !== value).join(' '); },
      };
    }
    setAttribute(k, v) { if (k === 'class') this.className = v; else this[k] = v; }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; this._text = ''; }
    addEventListener(k, f) { (this.handlers[k] ||= []).push(f); }
    dispatch(k, props = {}) { for (const fn of this.handlers[k] || []) fn({ target: this, ...props }); }
    querySelector(selector) { return this.all().find(el => selector.startsWith('.') ? el.classList?.contains(selector.slice(1)) : el.tagName === selector.toUpperCase()); }
    all() { return this.children.flatMap(el => el instanceof Element ? [el, ...el.all()] : []); }
    focus() { document.activeElement = this; }
    set textContent(value) { this._text = value; this.children = []; }
    get textContent() { return String(this._text || '') + this.children.map(el => el.textContent || '').join(''); }
  }
  const saved = { document: globalThis.document, Node: globalThis.Node, requestAnimationFrame: globalThis.requestAnimationFrame };
  const body = new Element('body');
  globalThis.Node = Element;
  globalThis.document = { body, activeElement: body, createElement: tag => new Element(tag), createTextNode: text => ({ textContent: text }) };
  globalThis.requestAnimationFrame = fn => fn();
  t.after(() => Object.assign(globalThis, saved));
  const app = { events: new Emitter(), overlays, actions: { setOverlay() {} } };
  const api = initPhangsInfo(app, {});
  api.show();
  return { app, api, body, find: name => body.querySelector(`.${name}`) };
}

const nebulae = { counts: { hii_regions: 23244, galaxies: 19 }, galaxies: [{ name: 'ngc0628', n: 1687 }] };

test('PHANGS info starts before overlays and subscribes to later MUSE readiness once', async t => {
  const f = fixture(t);
  assert.match(f.body.textContent, /Loading MUSE nebular summary/);
  let resolveSummary, subscriptions = 0;
  const summaryPromise = new Promise(resolve => { resolveSummary = resolve; });
  const ready = { then(fn) { subscriptions++; return summaryPromise.then(fn); } };
  f.app.overlays = { phangs: { nebulae: { ready } } };
  f.app.events.emit('phangs:ready', phangs);
  f.app.events.emit('phangs:ready', phangs);
  assert.equal(subscriptions, 1);
  resolveSummary(nebulae);
  await summaryPromise;
  assert.match(f.body.textContent, /23,244 classified H II regions in 19 galaxies/);
  assert.equal(f.find('pgi-methods').open, '');
  assert.equal(f.find('pgi-list'), undefined);
});

test('PHANGS info also accepts MUSE summaries resolved before UI initialization', async t => {
  const f = fixture(t, { phangs: { catalogue: phangs, ready: Promise.resolve(phangs), nebulae: { ready: Promise.resolve(nebulae) } } });
  await Promise.resolve();
  assert.match(f.body.textContent, /23,244 classified H II regions in 19 galaxies/);
  assert.match(f.body.textContent, /z ≈ vLSR\/c/);
});

test('PHANGS information opens methods by default and leaves galaxy browsing to header search', t => {
  const f = fixture(t, { phangs: { catalogue: phangs } });
  assert.equal(f.find('pgi-methods').open, '');
  assert.equal(f.find('pgi-search'), undefined);
  assert.equal(f.find('pgi-list'), undefined);
  assert.match(f.body.textContent, /118 entries/);
  assert.match(f.body.textContent, /Measurements and comparison limits/);
  assert.doesNotMatch(f.body.textContent, /Browse the sample/);
  f.api.hide();
  assert.equal(f.api.open, false);
  f.api.show();
  assert.equal(f.api.open, true);
});
