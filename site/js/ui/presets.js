// Preset cartridges (DESIGN.md §13.5): a tray of small rounded cartridges, each a live preview
// of its canonical view above a 3–4 character code. The active one glows orange; the glow
// fades as the frame drifts away (alignment < 0.99). Any other cartridge whose view the
// frame happens to match (e.g. after a manual rotation) lights up too.

import { h, smoothstep, debounce } from './dom.js';
import { setTip } from './tooltip.js';
import { createPopover } from './popover.js';
import { axisInfo, axisLabel, frameFromCombos } from '../math/frame.js';

const SMALL = { width: 46, height: 26 };
const BIG = { width: 216, height: 132 };

export function keyForIndex(i) {
  return i < 9 ? String(i + 1) : i === 9 ? '0' : null;
}

export function initPresets(app, mount, ui) {
  const presets = app.config.presets;
  const tray = h('div', { class: 'carts-tray', role: 'toolbar', 'aria-label': 'Canonical views' });
  const items = new Map();
  const primary = new Set(['sfms', 'ssfr', 'hi']);
  const moreLabel = h('span', { text: 'More views' });
  const more = h('button', { type: 'button', class: 'views-more', 'aria-haspopup': 'dialog' },
    h('span', { class: 'views-more-label' }, h('small', { text: 'Explore' }), moreLabel), h('span', { class: 'views-chevron', text: '⌄', 'aria-hidden': 'true' }));
  const menuList = h('div', { class: 'views-list' });
  const closeButton = h('button', { type: 'button', class: 'views-close', text: 'Close', 'aria-label': 'Close additional views' });
  const panel = h('section', { id: 'more-views-panel', class: 'control-popover views-panel', role: 'dialog', 'aria-label': 'Additional views' },
    h('div', { class: 'popover-head' }, h('div', {}, h('span', { class: 'popover-eyebrow', text: 'Galaxy manifold' }), h('h2', { text: 'More views' })), closeButton),
    h('p', { class: 'popover-sub', text: 'Additional projections of the SDSS reference sample. PHANGS points appear where measurements are available.' }), menuList);
  const pop = createPopover(more, panel);
  closeButton.addEventListener('click', () => pop.close(true));
  more.addEventListener('click', () => {
    if (pop.open) return pop.close(true);
    ui.closeMenus();
    pop.show();
  });
  more.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); ui.closeMenus(); pop.show(); menuList.querySelector('button')?.focus(); }
  });
  menuList.addEventListener('keydown', e => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const buttons = [...menuList.querySelectorAll('button')];
    const i = buttons.indexOf(document.activeElement);
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1 : (i + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next]?.focus();
  });

  presets.forEach((p, i) => {
    const key = keyForIndex(i);
    const screen = h('span', { class: 'cart-screen' });
    const b = h('button', {
      class: primary.has(p.id) ? 'cart' : 'cart cart-menu',
      type: 'button',
      'data-id': p.id,
      'aria-label': `${p.code} · ${p.name}`,
      'aria-pressed': 'false',
      style: { '--i': String(i) },
    }, screen, h('span', { class: 'cart-code', text: p.code }));
    b.addEventListener('click', () => {
      app.actions.applyPreset(p.id);
      if (!primary.has(p.id)) pop.close(true);
    });
    const item = { p, b, screen, key, big: null, bigVersion: -1, on: 0 };
    setTip(b, () => ({ node: richTip(item) }), 'bottom');
    b.dataset.tipDelay = '260';
    items.set(p.id, item);
    if (primary.has(p.id)) tray.append(b);
    else {
      b.append(h('span', { class: 'cart-name', text: p.name }), h('span', { class: 'cart-selected', text: '✓', 'aria-hidden': 'true' }));
      menuList.append(b);
    }
  });
  mount.append(tray, more);

  // Touch taps select the cartridge under pointerdown, and the click that follows is dropped.
  // iOS Safari routes that click to the wrong cartridge (the next one to the right) after the
  // tray has been scrolled by scrollTo below, while pointer events still hit the right one.
  // A press held long enough for the tooltip (tooltip.js) selects nothing, as before.
  let tap = null, dropClickUntil = 0;
  tray.addEventListener('pointerdown', (e) => {
    const b = e.pointerType === 'touch' && e.isPrimary && e.target.closest('.cart');
    tap = b ? { b, x: e.clientX, y: e.clientY, t: performance.now() } : null;
  });
  tray.addEventListener('pointermove', (e) => {
    if (tap && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > 10) tap = null;
  });
  tray.addEventListener('pointercancel', () => { tap = null; });
  tray.addEventListener('pointerup', (e) => {
    if (!tap || e.pointerType !== 'touch') return;
    const { b, t } = tap;
    tap = null;
    dropClickUntil = performance.now() + 700;
    if (performance.now() - t < 520) app.actions.applyPreset(b.dataset.id);
  });
  tray.addEventListener('click', (e) => {
    if (performance.now() < dropClickUntil) {
      dropClickUntil = 0;
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);

  // ------------------------------------------------------------------ rich hover card
  let version = 0;   // bumps when previews must be regenerated (filters, context restore)
  function literatureLabels(p) {
    const lit = ui.literature || [];
    const ids = new Set(p.literature || []);
    return lit.filter((r) => ids.has(r.id) || r.view === p.id).map((r) => r.label).filter((v, i, a) => a.indexOf(v) === i);
  }

  function axesText(p) {
    const res = frameFromCombos(p.x, p.y, app.data.dims);
    if (!res.F) return ['', ''];
    const dims = app.data.dims;
    return [0, 1].map((c) => axisLabel(axisInfo(res.F, c, dims), dims));
  }

  function richTip(item) {
    const { p } = item;
    if (!item.big || item.bigVersion !== version) {
      const c = app.data.loaded ? app.preview(p.id, { ...BIG, dpr: 2 }) : null;
      if (c) {
        item.big = c;
        item.bigVersion = version;
      }
    }
    const [ax, ay] = axesText(p);
    const lits = literatureLabels(p);
    return h('div', { class: 'cp' },
      h('div', { class: 'cp-screen' }, item.big || h('span', { class: 'cp-empty' })),
      h('div', { class: 'cp-row' },
        h('span', { class: 'cp-code', text: p.code }),
        item.key ? h('kbd', { class: 'tip-key', text: item.key }) : null),
      h('div', { class: 'cp-name', text: p.name }),
      h('div', { class: 'cp-axes' },
        h('span', { class: 'cp-ax' }, h('i', { text: 'x' }), ax),
        h('span', { class: 'cp-ax' }, h('i', { text: 'y' }), ay)),
      lits.length ? h('div', { class: 'cp-lit' }, lits.map((l) => h('span', { text: l }))) : null);
  }

  // ------------------------------------------------------------------ small previews
  let queue = [];
  let pumping = false;
  function pump() {
    if (!queue.length) {
      pumping = false;
      return;
    }
    pumping = true;
    const id = queue.shift();
    const item = items.get(id);
    const c = item && app.preview(id, { ...SMALL, dpr: 2 });
    if (c && c.ready) {
      c.classList.add('cart-canvas');
      c.ready.then((ok) => {
        if (ok === null) return;
        item.screen.replaceChildren(c);
        item.screen.classList.add('lit');
      });
    }
    // one preview per frame keeps each frame's GPU/CPU cost small (~3 ms)
    requestAnimationFrame(() => setTimeout(pump, 0));
  }
  function requestPreviews() {
    if (!app.data.loaded) return;
    version++;
    queue = presets.map((p) => p.id);
    // the active / hovered ones first
    const act = app.store.get().presetId;
    if (act) queue.sort((a, b) => (a === act ? -1 : b === act ? 1 : 0));
    if (!pumping) pump();
  }
  const requestPreviewsLater = debounce(requestPreviews, 700);

  app.events.on('data:ready', () => setTimeout(requestPreviews, 120));
  app.events.on('context', ({ lost }) => {
    if (!lost) setTimeout(requestPreviews, 200);
  });
  app.events.on('state', ({ changed, state, source }) => {
    if (changed.includes('filters')) requestPreviewsLater();
    if (changed.includes('presetId')) updateActive(true);
  });

  // ------------------------------------------------------------------ active state
  let lastFV = -1, lastAll = 0;
  function updateActive(force = false) {
    if (!force && app.frameVersion === lastFV) return;
    lastFV = app.frameVersion;
    const now = performance.now();
    const act = app.store.get().presetId;
    const activePreset = presets.find(p => p.id === act);
    const secondaryActive = activePreset && !primary.has(act);
    more.classList.toggle('active', !!secondaryActive);
    const label = secondaryActive ? activePreset.code : 'More views';
    if (moreLabel.textContent !== label) moreLabel.textContent = label;
    more.setAttribute('aria-label', secondaryActive ? `More views, selected: ${activePreset.name}` : 'More views');
    const checkAll = force || now - lastAll > 140;
    if (checkAll) lastAll = now;
    for (const [id, item] of items) {
      let on = item.on;
      if (id === act) on = smoothstep(0.9, 0.99, app.presetAlignment(id));
      else if (checkAll) {
        const a = app.presetAlignment(id);
        on = a > 0.97 ? 0.85 * smoothstep(0.97, 0.995, a) : 0;
      }
      if (Math.abs(on - item.on) > 0.004 || (on === 0) !== (item.on === 0)) {
        item.on = on;
        item.b.style.setProperty('--on', on.toFixed(3));
        item.b.classList.toggle('active', on > 0.5);
        item.b.setAttribute('aria-pressed', on > 0.5 ? 'true' : 'false');
      }
    }
  }
  app.events.on('render', () => updateActive(false));
  app.events.on('settle', () => updateActive(true));

  // keep the active cartridge in view in a scrolling tray (narrow screens)
  app.events.on('state', ({ changed, state }) => {
    if (!changed.includes('presetId') || !state.presetId) return;
    const item = items.get(state.presetId);
    if (item && primary.has(item.p.id) && tray.scrollWidth > tray.clientWidth + 2) {
      // center the cartridge (measured against the tray itself, not the offsetParent)
      const br = item.b.getBoundingClientRect(), tr = tray.getBoundingClientRect();
      const left = tray.scrollLeft + (br.left - tr.left) - tr.width / 2 + br.width / 2;
      tray.scrollTo({ left: Math.max(0, left), behavior: app.motion.reduced() ? 'auto' : 'smooth' });
    }
  });

  return {
    items,
    close: pop.close,
    requestPreviews,
    literatureLabels,
    apply(i) {
      const p = presets[i];
      if (p) app.actions.applyPreset(p.id);
    },
  };
}
