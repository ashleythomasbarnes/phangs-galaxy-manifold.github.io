// Hover card (DESIGN.md §13.7): after a 120 ms dwell, a small cream-framed card with the
// thumbnail (a thumbnail galaxy within 12 px is preferred) and three values: x, y and the
// color variable. Never shown while the view is moving.

import { h, clamp, fmtFixed } from './dom.js';
import { axisValue } from '../math/frame.js';
import { sampleColormapHex } from '../gl/colormaps.js';
import { NEUTRAL } from '../config/style.js';
import { shortKids, catToken } from './uiconfig.js';
import { phangsImageUrl } from '../data/phangs.js';
import { NEBULA_KEYS, NEBULA_SUMMARIES } from '../data/nebulae.js';

const DWELL = 120;

export function initHover(app, mount, ui) {
  const { data, config } = app;
  const img = h('img', { alt: '', decoding: 'async', draggable: 'false' });
  const pic = h('div', { class: 'hc-pic' }, img);
  const rows = h('div', { class: 'hc-rows' });
  const card = h('div', { class: 'hc', role: 'tooltip', 'aria-hidden': 'true' }, pic, rows);
  const ring = h('div', { class: 'hc-ring', 'aria-hidden': 'true' });
  mount.append(ring, card);

  let timer = 0, shownI = -1, pendingI = -1, last = null;

  function hide() {
    clearTimeout(timer);
    timer = 0;
    pendingI = -1;
    shownI = -1;
    card.classList.remove('on');
    ring.classList.remove('on');
  }

  function axisRow(i, col) {
    const info = app.axisInfo(col);
    const tag = col === 0 ? 'x' : 'y';
    if (!info) return { k: tag, v: '–' };
    const label = info.single ? data.dims[info.ref].short : tag;
    for (const t of info.terms) {
      const raw = data.raw[t.index];
      if (raw && raw[i] === 0) return { k: label, v: '–', axis: true, combo: !info.single };
    }
    const [X, Y] = app.proj.projectRow(i, app.frame);
    const A = axisValue(info, col === 0 ? X : Y);
    const v = info.single ? config.dims.format(info.refKey, A) : fmtFixed(A, 2);
    return { k: label, v, axis: true, combo: !info.single };
  }

  function colorRow(i) {
    const c = app.colorInfo();
    if (c.mode === 'continuous') {
      const x = data.value(i, c.key);
      if (!Number.isFinite(x)) return { k: c.spec.short, v: '–', sw: null };
      const t = clamp((x - c.range[0]) / (c.range[1] - c.range[0]), 0, 1);
      return { k: c.spec.short, v: config.dims.format(c.key, x), sw: sampleColormapHex(c.cmap, t, c.reverse) };
    }
    if (c.mode === 'categorical') {
      const code = data.catCode(i, c.cat);
      const e = c.spec.codes.find((q) => q.code === code);
      return { k: catToken(c.spec), v: e ? e.label : '∅', sw: e ? c.hex[code] || NEUTRAL : null, cat: true };
    }
    return null;
  }

  function show(i, sx, sy, atCursor = false) {
    if (app.overlays?.phangs?.hovering) return;
    if (app.isMoving() || ui.dnd?.active || document.documentElement.classList.contains('dragging')) return;
    shownI = i;
    img.onload = img.onerror = null;
    img.alt = '';
    const k = app.thumbs?.available ? app.thumbs.forRow(i) : -1;
    card.classList.toggle('has-pic', k >= 0);
    if (k >= 0) {
      app.thumbs.assign(img, k);
    } else img.removeAttribute('src');
    const list = [axisRow(i, 0), axisRow(i, 1)];
    const cr = colorRow(i);
    if (cr) list.push(cr);
    rows.replaceChildren(...list.map((r) => h('div', { class: `hc-row${r.combo ? ' combo' : ''}${r.cat ? ' cat' : ''}` },
      h('span', { class: 'hc-k' }, r.combo || r.cat ? [r.k] : shortKids(r.k)),
      r.sw !== undefined ? h('i', { class: 'hc-sw', style: { background: r.sw || 'transparent' } }) : null,
      h('span', { class: 'hc-v', text: r.v }))));

    // anchor at the galaxy (not the cursor) with a ring on it; in mosaic mode the tile under
    // the cursor is the galaxy (the overlay highlights the tile), so anchor at the cursor
    let gx = sx, gy = sy;
    if (!atCursor) {
      const [X, Y] = app.proj.projectRow(i, app.frame);
      [gx, gy] = app.camera.toScreen(X, Y);
      ring.style.transform = `translate(${gx.toFixed(1)}px, ${gy.toFixed(1)}px)`;
    }
    ring.classList.toggle('on', !atCursor);
    card.classList.add('on');
    const W = card.offsetWidth, H = card.offsetHeight;
    const sw = app.camera.width, sh = app.camera.height;
    let x = gx + 14, y = gy + 14;
    if (x + W > sw - 8) x = gx - 14 - W;
    if (y + H > sh - 8) y = gy - 14 - H;
    card.style.transform = `translate(${Math.round(clamp(x, 6, sw - W - 6))}px, ${Math.round(clamp(y, 6, sh - H - 6))}px)`;
  }

  app.events.on('hover', ({ index, sx, sy }) => {
    if (app.overlays?.phangs?.nebulae.hovering) return;
    if (app.overlays?.phangs?.hovering) { hide(); return; }
    const mosaicTile = app.store.get().mode === 'mosaic' && Number.isFinite(sx) ? app.overlays?.mosaic?.tileAt?.(sx, sy) : null;
    if (index < 0 && !(mosaicTile && mosaicTile.row >= 0)) {
      hide();
      return;
    }
    // no card over the awake compass: the instrument has the pointer's attention there
    const sr = app.layers.stage.getBoundingClientRect();
    if (ui.compass?.covers(sx + sr.left, sy + sr.top)) {
      hide();
      return;
    }
    let i = index, atCursor = false;
    const tile = mosaicTile;
    if (tile && tile.row >= 0) {
      i = tile.row;   // the galaxy whose cutout is on this tile
      atCursor = true;
    } else if (app.thumbs?.available) {
      const t = app.proj.pick(sx, sy, 12, { thumbsOnly: true });
      if (t >= 0) i = t;
    }
    last = { i, sx, sy, atCursor };
    if (i === shownI) return;
    if (i !== pendingI) {
      pendingI = i;
      clearTimeout(timer);
      timer = setTimeout(() => {
        timer = 0;
        if (last && last.i === i) show(i, last.sx, last.sy, last.atCursor);
      }, shownI >= 0 ? 40 : DWELL);
    }
  });
  app.events.on('phangs:hover', ({ row, sx, sy }) => {
    hide();
    if (!row || app.isMoving()) return;
    timer = setTimeout(() => {
      if (app.isMoving() || ui.dnd?.active) return;
      const p = app.overlays.phangs.project(row);
      const values = app.overlays.phangs.values(row);
      const list = [{ k: 'PHANGS', v: row.name.toUpperCase() }];
      if (row.nebula) list.push({ k: 'MUSE H II', v: `Region ${row.nebula.id}` });
      else if (NEBULA_KEYS.some(key => Number.isFinite(values[key])))
        list.push({ k: 'MUSE summary', v: NEBULA_SUMMARIES[app.overlays.phangs.nebulae.options.summary] });
      for (const col of [0, 1]) {
        const info = app.axisInfo(col);
        if (!info) continue;
        const valid = info.terms.every(t => Number.isFinite(values[data.dims[t.index].key]));
        const value = valid ? axisValue(info, col === 0 ? p.X : p.Y) : NaN;
        const sizeProxy = info.single && info.refKey === 'logR50' && app.overlays.phangs.sizeMode === 'ned-exponential';
        const label = sizeProxy ? 'Rₑ (NED)' : info.single && info.refKey === 'logSigma' ? 'Σ★ (R90)' : info.single ? data.dims[info.ref].short : col === 0 ? 'x' : 'y';
        const hostValue = row.nebula && info.terms.every(t => !NEBULA_KEYS.includes(data.dims[t.index].key));
        list.push({ k: hostValue ? `Host ${label}` : label,
          v: Number.isFinite(value) ? info.single ? config.dims.format(info.refKey, value) : fmtFixed(value, 2) : '–' });
      }
      rows.replaceChildren(...list.map(r => h('div', { class: 'hc-row' },
        h('span', { class: 'hc-k' }, shortKids(r.k)), h('span', { class: 'hc-v', text: r.v }))));
      // Use the inspector's cutout URL too, so hover/click share the browser image cache.
      const url = data.manifest?.host?.externalImages === false ? null : phangsImageUrl(row);
      card.classList.toggle('has-pic', !!url);
      img.alt = `DSS2 colour image of ${row.name.toUpperCase()}`;
      img.onload = null;
      img.onerror = () => card.classList.remove('has-pic');
      if (url) img.src = url;
      else img.removeAttribute('src');
      card.classList.add('on');
      ring.classList.add('on');
      ring.style.transform = `translate(${sx}px,${sy}px)`;
      const W = card.offsetWidth, H = card.offsetHeight;
      const x = sx + W + 14 > app.camera.width - 8 ? sx - W - 14 : sx + 14;
      const y = sy + H + 14 > app.camera.height - 8 ? sy - H - 14 : sy + 14;
      card.style.transform = `translate(${Math.round(clamp(x, 6, app.camera.width - W - 6))}px,${Math.round(clamp(y, 6, app.camera.height - H - 6))}px)`;
    }, DWELL);
  });
  app.events.on('frame', ({ animating }) => {
    if (animating) hide();
  });
  app.events.on('camera', hide);
  app.events.on('resize', hide);
  // the card's values (and, in mosaic mode, its galaxy) depend on these
  app.events.on('state', ({ changed }) => {
    if (changed.some((k) => k === 'mode' || k === 'color' || k === 'filters' || k === 'mosaic' || k === 'phangs')) hide();
  });
  app.layers.stage.addEventListener('pointerleave', hide);
  app.layers.stage.addEventListener('pointerdown', hide);

  return { hide };
}
