// Top bar: PHANGS wordmark, counts, galaxy search, views and data information.

import { h, fmtInt } from './dom.js';
import { icon, starburstMark } from './icons.js';
import { setTip } from './tooltip.js';
import { initPresets } from './presets.js';
import { initGalaxySearch } from './search.js';

export function initHeader(app, mount, ui) {
  mount.replaceChildren();
  const brand = h('a', {
    class: 'tb-brand',
    href: '#',
    'aria-label': 'PHANGS Galaxy Manifold, reset the view',
  });
  brand.append(h('span', { html: starburstMark('tb-mark') }),
    h('span', { class: 'tb-word' }, h('span', { class: 'tb-word-prefix', text: 'PHANGS' }),
      h('span', { class: 'tb-word-name', text: 'GALAXY MANIFOLD' })));
  brand.addEventListener('click', (e) => {
    e.preventDefault();
    app.actions.resetView();
  });
  setTip(brand, { title: 'PHANGS Galaxy Manifold', sub: 'Reset to the current canonical view' }, 'bottom');

  const count = h('b', { text: fmtInt(app.data.n) });
  const badge = h('span', { class: 'tb-badge', role: 'status', 'aria-live': 'off' }, h('i', { text: 'N' }), count);
  let inView = app.data.n;
  setTip(badge, () => ({
    title: `${fmtInt(inView)} galaxies in view`,
    meta: `${fmtInt(app.data.n)} in ${app.data.manifest.title || 'the sample'}`,
  }), 'bottom');

  const searchMount = h('div', { class: 'tb-search' });
  const search = initGalaxySearch(app, searchMount, ui);
  const viewMount = h('div', { class: 'tb-presentation' });
  const carts = h('div', { class: 'tb-carts' });
  const about = h('button', { class: 'tb-about tb-info-button', type: 'button', 'aria-label': 'SDSS information, credits and shortcuts' },
    h('span', { html: icon('info') }), h('small', { text: 'SDSS' }));
  const phangsAbout = h('button', { class: 'tb-info-button tb-phangs-info', type: 'button', 'aria-label': 'PHANGS sample information and methods' },
    h('span', { html: icon('info') }), h('small', { text: 'PHANGS' }));
  setTip(about, { title: 'SDSS reference sample', sub: 'Data, literature, shortcuts and caveats', key: '?' }, 'bottom');
  setTip(phangsAbout, { title: 'PHANGS comparison sample', sub: 'Galaxies, survey coverage and measurement sources' }, 'bottom');
  about.addEventListener('click', () => { ui.closeMenus(); ui.phangsInfo?.hide(); ui.about?.toggle(); });
  phangsAbout.addEventListener('click', () => { ui.closeMenus(); ui.about?.hide(); ui.phangsInfo?.toggle(); });

  mount.append(h('div', { class: 'tb' }, h('div', { class: 'tb-left' }, brand, badge), searchMount,
    h('div', { class: 'tb-actions' }, viewMount, carts, h('div', { class: 'tb-info-buttons' }, phangsAbout, about))));

  const presets = initPresets(app, carts, ui);

  function syncPresentation() {
    carts.hidden = app.store.get().presentation === 'table';
    if (carts.hidden) presets.close();
  }
  app.events.on('state', ({ changed }) => { if (changed.includes('presentation')) syncPresentation(); });
  syncPresentation();

  // live count of galaxies in view (vis ≥ 50%, filters included), refreshed at each settle
  let last = -1;
  function recount() {
    const vis = app.proj && app.proj.vis;
    if (!vis || app.proj.stale) return;
    if (app.proj.version === last) return;
    last = app.proj.version;
    let c = 0;
    for (let i = 0; i < vis.length; i++) if (vis[i] >= 128) c++;
    inView = c;
    const txt = fmtInt(c);
    if (count.textContent !== txt) {
      count.textContent = txt;
      badge.classList.remove('tick');
      void badge.offsetWidth;
      badge.classList.add('tick');
    }
  }
  app.events.on('settle', recount);

  // Keep the tour state available to the header styling.
  app.events.on('state', ({ changed, state }) => {
    if (changed.includes('tour')) mount.classList.toggle('touring', !!state.tour.playing);
  });

  return { presets, about, phangsAbout, search, recount, viewMount };
}
