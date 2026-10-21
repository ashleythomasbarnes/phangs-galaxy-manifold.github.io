import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Emitter } from '../js/events.js';
import { initPresets, keyForIndex } from '../js/ui/presets.js';

function fixture(t) {
  class Element {
    constructor(tag) {
      this.tagName = tag.toUpperCase(); this.children = []; this.handlers = {}; this.dataset = {};
      this.style = { setProperty() {} }; this.className = ''; this.hidden = false;
      this.classList = {
        add: value => { this.className += ` ${value}`; },
        toggle: (value, on) => {
          this.className = this.className.split(/\s+/).filter(s => s !== value).join(' ');
          if (on) this.classList.add(value);
        },
      };
    }
    setAttribute(k, v) { if (k === 'class') this.className = v; else if (k === 'hidden') this.hidden = true; else this[k] = v; }
    append(...nodes) { this.children.push(...nodes); }
    replaceChildren(...nodes) { this.children = nodes; }
    addEventListener(k, fn) { (this.handlers[k] ||= []).push(fn); }
    dispatch(k, props = {}) { for (const fn of this.handlers[k] || []) fn({ preventDefault() {}, ...props }); }
    all() { return this.children.flatMap(el => el instanceof Element ? [el, ...el.all()] : []); }
    querySelectorAll(selector) { return this.all().filter(el => selector.startsWith('button') ? el.tagName === 'BUTTON' : el.className.split(/\s+/).includes(selector.slice(1))); }
    querySelector(selector) { return this.querySelectorAll(selector)[0]; }
    getBoundingClientRect() { return { right: 700, bottom: 45 }; }
    focus() { document.activeElement = this; }
  }
  const saved = { document: globalThis.document, window: globalThis.window, Node: globalThis.Node, requestAnimationFrame: globalThis.requestAnimationFrame };
  const floating = new Element('div');
  globalThis.Node = Element;
  globalThis.document = { createElement: tag => new Element(tag), createTextNode: text => ({ textContent: text }),
    getElementById: () => floating, addEventListener() {} };
  globalThis.window = { addEventListener() {}, innerWidth: 1280, innerHeight: 988 };
  globalThis.requestAnimationFrame = () => 1;
  t.after(() => Object.assign(globalThis, saved));
  const presets = ['sfms', 'ssfr', 'hi', 'bpt'].map(id => ({ id, code: id.toUpperCase(), name: `${id} view` }));
  const applied = [], previews = [], state = { presetId: 'sfms' }, events = new Emitter();
  const app = { config: { presets }, events, data: { loaded: false }, frameVersion: 1,
    store: { get: () => state }, presetAlignment: id => id === state.presetId ? 1 : 0,
    actions: { applyPreset: id => { applied.push(id); state.presetId = id; events.emit('state', { changed: ['presetId'], state }); } },
    preview: id => { previews.push(id); const canvas = new Element('canvas'); canvas.ready = Promise.resolve(true); return canvas; } };
  const mount = new Element('div');
  const api = initPresets(app, mount, { closeMenus() {} });
  return { app, api, mount, applied, previews, panel: floating.children[0], menu: floating.querySelector('.views-list') };
}

test('all canonical views share one Views dropdown and retain numeric shortcut ordering', t => {
  const f = fixture(t);
  assert.equal(f.mount.children.length, 1);
  assert.equal(f.mount.children[0]['aria-label'], 'Views');
  assert.equal(f.menu.children.length, f.app.config.presets.length);
  assert.deepEqual([...f.api.items.keys()], ['sfms', 'ssfr', 'hi', 'bpt']);
  f.mount.children[0].dispatch('click');
  assert.equal(f.panel.hidden, false);
  f.api.items.get('sfms').b.dispatch('click');
  assert.equal(f.panel.hidden, true);
  assert.equal(f.mount.children[0].children[0].textContent, 'Views');
  f.api.apply(2);
  assert.deepEqual(f.applied, ['sfms', 'hi']);
  assert.equal(keyForIndex(8), '9');
  assert.equal(keyForIndex(9), '0');
});

test('Views dropdown retains arrow navigation and previews for every preset', async t => {
  const f = fixture(t), trigger = f.mount.children[0];
  trigger.dispatch('keydown', { key: 'ArrowDown' });
  assert.equal(document.activeElement, f.menu.children[0]);
  f.menu.dispatch('keydown', { key: 'End' });
  assert.equal(document.activeElement, f.menu.children.at(-1));
  f.menu.dispatch('keydown', { key: 'ArrowDown' });
  assert.equal(document.activeElement, f.menu.children[0]);
  f.menu.dispatch('keydown', { key: 'Home' });
  assert.equal(document.activeElement, f.menu.children[0]);
  f.app.data.loaded = true;
  f.api.requestPreviews();
  await Promise.resolve();
  assert.deepEqual(f.previews, ['sfms']);
  assert.equal(f.api.items.get('sfms').screen.children[0].tagName, 'CANVAS');
  assert.ok([...f.api.items.values()].every(item => item.b.dataset.tipDelay === '260'));
});
