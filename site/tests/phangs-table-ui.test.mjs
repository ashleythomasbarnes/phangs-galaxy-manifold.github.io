import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Store } from '../js/state.js';
import { Emitter } from '../js/events.js';
import { initPhangsTable } from '../js/ui/phangs-table.js';

const catalogue = JSON.parse(readFileSync(new URL('../data_phangs/phangs.json', import.meta.url)));
function fixture(t) {
  let html;
  class Element {
    constructor(tag = 'div') {
      this.tagName = tag.toUpperCase(); this.children = []; this.handlers = {}; this.dataset = {}; this.style = {}; this.hidden = false;
      this.value = ''; this.scrollLeft = 0; this.scrollTop = 0; this._text = ''; this.classes = new Set();
      this.classList = { toggle: (key, on) => on ? this.classes.add(key) : this.classes.delete(key), add: key => this.classes.add(key), remove: key => this.classes.delete(key) };
    }
    setAttribute(k, v) { this[k] = v; if (k === 'class') this.classes = new Set(v.split(' ')); if (k.startsWith('data-')) this.dataset[k.slice(5)] = v; }
    append(...nodes) { for (const n of nodes) { n.parentNode?.remove(n); n.parentNode = this; this.children.push(n); } }
    remove(n) { this.children = this.children.filter(c => c !== n); n.parentNode = null; }
    replaceChildren(...nodes) { for (const c of this.children) c.parentNode = null; this.children = []; this._text = ''; this.append(...nodes); }
    insertBefore(n, before) { n.parentNode?.remove(n); n.parentNode = this; this.children.splice(this.children.indexOf(before), 0, n); }
    set textContent(v) { this.children = []; this._text = String(v); }
    get textContent() { return this._text + this.children.map(c => c.textContent).join(''); }
    get isConnected() { let n = this; while (n.parentNode) n = n.parentNode; return n === html; }
    addEventListener(k, fn) { (this.handlers[k] ||= []).push(fn); }
    dispatch(k) { for (const fn of this.handlers[k] || []) fn({ currentTarget: this, target: this, preventDefault() {}, stopPropagation() {} }); }
    contains(n) { return n === this || this.children.some(c => c.contains(n)); }
    focus() { document.activeElement = this; }
    getBoundingClientRect() { return { left: 400, right: 600, top: 20, bottom: 50 }; }
    get offsetWidth() { return 340; } get offsetHeight() { return 300; }
    all() { return this.children.flatMap(c => [c, ...c.all()]); }
    querySelectorAll(selector) { return this.all().filter(el => selector.split(',').some(s => {
      s = s.trim();
      if (s.startsWith('.')) return el.classes.has(s.slice(1));
      return el.tagName === s.split(':')[0].toUpperCase() && (!s.includes(':not(:disabled)') || !el.disabled);
    })); }
    querySelector(s) { return this.querySelectorAll(s)[0] || null; }
    showModal() { this.open = true; } close() { this.open = false; }
  }
  const old = { document: globalThis.document, window: globalThis.window, Node: globalThis.Node, requestAnimationFrame: globalThis.requestAnimationFrame };
  html = new Element('html'); const body = new Element('body'); html.append(body);
  const stage = new Element(), stageUI = new Element(), consoleEl = new Element(), floating = new Element();
  consoleEl.id = 'console'; floating.id = 'gm-float'; body.append(stage, consoleEl, floating);
  globalThis.Node = Element;
  globalThis.document = { body, documentElement: html, createElement: tag => new Element(tag), createTextNode: text => {
    const el = new Element('#text'); el.textContent = text; return el;
  }, getElementById: id => body.all().find(el => el.id === id), addEventListener() {} };
  globalThis.window = { innerWidth: 1000, innerHeight: 900, addEventListener() {} };
  const queue = [];
  globalThis.requestAnimationFrame = fn => { queue.push(fn); return queue.length; };
  t.after(() => Object.assign(globalThis, old));
  const store = new Store({ presentation: 'table', tablePreset: 'global', tableColumns: {}, tableSort: { key: 'name', direction: 'asc' }, phangs: { columnFilters: [], surveys: {}, nameQuery: '' } });
  const events = new Emitter(); store.subscribe((state, changed) => events.emit('state', { state, changed }));
  const app = { store, events, layers: { stage, stageUI }, measure() {} };
  const mount = new Element(); body.append(mount);
  let api;
  const ui = { header: { viewMount: mount, search: { focus() {} } }, closeMenus: () => api?.closePanel(false) };
  api = initPhangsTable(app, ui);
  const flush = () => { while (queue.length) queue.shift()(); };
  events.emit('phangs:ready', catalogue); flush();
  const find = (cls, root = body) => root.all().find(el => el.classes.has(cls));
  const control = text => body.all().find(el => el.tagName === 'BUTTON' && el.textContent === text);
  return { app, store, events, api, body, find, control, flush, ui };
}

test('table opens with focused columns, a header switch and contextual MUSE controls', t => {
  const f = fixture(t);
  assert.equal(f.find('phangs-table-panel').hidden, false);
  assert.deepEqual(f.find('phangs-view-switch').children.map(c => c.textContent), ['Table', 'Plot']);
  assert.equal(f.find('phangs-table').querySelector('thead').querySelector('tr').children.length, 7);
  assert.equal(f.find('phangs-table-status').textContent, '118 of 118');
  assert.equal(f.find('table-muse-method').hidden, true);
  f.control('MUSE').dispatch('click'); f.flush();
  assert.equal(f.find('table-muse-method').hidden, false);
  assert.match(f.find('table-method-note').textContent, /Loading MUSE/);
  f.control('Global').dispatch('click'); f.flush();
  assert.equal(f.find('table-muse-method').hidden, true);
  f.store.set({ phangs: { columnFilters: [{ key: 'muse_OH_PP04', min: 8.5 }] } }); f.flush();
  assert.equal(f.find('table-muse-method').hidden, false);
  assert.equal(f.find('phangs-active-filters').hidden, false);
});

test('columns chooser covers every field and group changes preserve filters, sort and custom columns', t => {
  const f = fixture(t);
  f.control('Columns').dispatch('click');
  const panel = f.find('phangs-data-panel');
  assert.equal(panel.querySelectorAll('input').filter(el => el.type === 'checkbox').length, 131);
  const ra = panel.querySelectorAll('label').find(el => el.textContent === 'RA (deg)').querySelector('input');
  ra.checked = true; ra.dispatch('change'); f.flush();
  assert.ok(f.store.get().tableColumns.global.includes('ra'));
  f.api.closePanel(); assert.equal(document.activeElement, f.control('Columns'));
  f.store.set({ phangs: { columnFilters: [{ key: 'morph_bar', values: ['BAR'] }] }, tableSort: { key: 'pgc', direction: 'desc' } }); f.flush();
  assert.equal(f.find('table-sort-note').hidden, false);
  f.control('Sizes').dispatch('click'); f.flush();
  assert.equal(f.find('table-sort-note').hidden, false);
  assert.equal(f.store.get().phangs.columnFilters[0].key, 'morph_bar');
  f.control('Global').dispatch('click'); f.flush();
  assert.ok(f.store.get().tableColumns.global.includes('ra'));
  f.control('Clear all').dispatch('click'); f.flush();
  assert.deepEqual(f.store.get().phangs.columnFilters, []);
  assert.equal(f.store.get().tableSort.key, 'pgc');
});

test('table scroll survives switching modes and catalogue failures have a readable state', t => {
  const f = fixture(t), scroll = f.find('phangs-table-scroll');
  scroll.scrollTop = 192; scroll.scrollLeft = 80; scroll.dispatch('scroll');
  f.control('Plot').dispatch('click'); f.flush();
  assert.equal(f.find('phangs-table-panel').hidden, true);
  f.control('Table').dispatch('click'); f.flush();
  assert.equal(scroll.scrollTop, 192); assert.equal(scroll.scrollLeft, 80);
  f.events.emit('phangs:ready', null); f.flush();
  assert.match(f.find('phangs-table-status').textContent, /unavailable/);
  assert.match(f.find('phangs-table-empty').textContent, /unavailable/);
});
