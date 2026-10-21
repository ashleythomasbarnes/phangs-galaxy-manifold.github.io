// MUSE summaries are small and loaded initially; the full region catalogue is lazy.
// Individual points use the shared canvas and click/hover hooks, never thousands of DOM nodes.
import { h } from '../../ui/dom.js';
import { fadeFactors } from '../../math/frame.js';
import { matchesPhangsSurveys } from '../../data/surveys.js';
import { NEBULA_KEYS, NEBULA_DISPLAYS, NEBULA_SUMMARIES, NEBULA_LABELS,
  nebulaOptions, hasNebulaAxes, nebulaValues, nebulaRow } from '../../data/nebulae.js';

export function createNebulae(app, ov, { hosts, baseValues, project, inspect, selected, changed }) {
  const display = h('select', { 'aria-label': 'MUSE nebula display' },
    ...Object.entries(NEBULA_DISPLAYS).map(([value, text]) => h('option', { value, text })));
  const summary = h('select', { 'aria-label': 'MUSE galaxy summary' },
    ...Object.entries(NEBULA_SUMMARIES).map(([value, text]) => h('option', { value, text })));
  const status = h('small', { role: 'status', text: 'Loading MUSE summaries…' });
  const retry = h('button', { type: 'button', text: 'Retry H II region loading', hidden: true, onclick: () => loadRegions() });
  const shortcut = h('button', { type: 'button', text: 'View PP04 mass–metallicity relation', onclick: () => {
    app.actions.setOverlay('phangs', true);
    app.actions.applyPreset('mzr2');
  } });
  const controls = h('details', { class: 'phangs-nebula-controls', open: true, hidden: true },
    h('summary', { text: 'MUSE nebulae' }),
    h('label', {}, h('span', { text: 'Display' }), display),
    h('label', {}, h('span', { text: 'Summary' }), summary), shortcut,
    h('small', { text: 'Weights: dust-corrected Hα luminosity. Summed lines uses flux sums instead.' }), status, retry);
  let catalogue = null, summaries = new Map(), regionData = null, groups = [], screen = null;
  let summaryError = '', regionError = '', regionPromise = null, hovered = null;
  let visible = 0, matching = 0, lastDrawMs = 0;
  const options = () => nebulaOptions(app.store.get().phangs);
  const enabled = () => app.store.get().overlays.phangs !== false;
  const activeAxes = () => hasNebulaAxes(app.data.dims, app.frame);

  const values = (row, base) => nebulaValues(row, base, summaries.get(row.name), options().summary);

  function clearHover() {
    if (!hovered) return;
    hovered = null;
    app.events.emit('phangs:hover', { row: null });
  }

  function rebuildGroups() {
    if (!regionData) return;
    const hostMap = new Map(hosts().map(row => [row.name, row]));
    const byHost = new Map();
    for (let i = 0; i < regionData.regions.length; i++) {
      const region = regionData.regions[i], host = hostMap.get(region.galaxy);
      if (!host) continue;
      if (!byHost.has(host.name)) byHost.set(host.name, { host, entries: [] });
      const u = NEBULA_KEYS.map(key => {
        const d = app.data.dims.find(d => d.key === key), value = region.values[key];
        return d && Number.isFinite(value) ? (value - d.center) / d.scale : NaN;
      });
      byHost.get(host.name).entries.push({ region, i, u });
    }
    groups = [...byHost.values()];
    screen = new Float32Array(regionData.regions.length * 2).fill(NaN);
  }

  async function read(path) {
    const res = await fetch(`data_phangs/${path}`, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json.schema !== 1 || typeof json.source_sha256 !== 'string') throw new Error('invalid catalogue');
    return json;
  }

  async function loadRegions() {
    if (!catalogue || regionData) return regionData;
    if (regionPromise) return regionPromise;
    regionError = '';
    regionPromise = read('nebulae_regions.json').then(json => {
      if (!Array.isArray(json.regions) || json.source_sha256 !== catalogue.source_sha256
        || json.regions.length !== catalogue.counts.hii_regions) throw new Error('region export differs from summary');
      regionData = json;
      rebuildGroups();
      return json;
    }).catch(err => {
      regionError = `H II regions unavailable (${err.message}). Galaxy summaries remain available.`;
      return null;
    }).finally(() => {
      regionPromise = null;
      syncControls();
      ov.invalidate();
    });
    syncControls();
    return regionPromise;
  }

  function syncControls() {
    const opts = options();
    display.value = opts.display;
    summary.value = opts.summary;
    display.disabled = summary.disabled = !catalogue;
    const wantsRegions = opts.display !== 'summary';
    retry.hidden = !wantsRegions || !regionError;
    status.textContent = summaryError || (!catalogue ? 'Loading MUSE summaries…' :
      wantsRegions && regionError ? regionError :
      wantsRegions && regionPromise ? 'Loading H II regions…' :
      wantsRegions && !app.data.loaded ? 'Loading plot axes…' :
      wantsRegions && !activeAxes() ? 'Region points appear when a nebular axis contributes to the view.' :
      wantsRegions && enabled() ? `${visible.toLocaleString()} H II regions visible · ${matching.toLocaleString()} selected` :
      `${catalogue.counts.hii_regions.toLocaleString()} H II regions · ${catalogue.counts.galaxies} galaxies`);
  }

  display.addEventListener('change', () => app.store.set({ phangs: { nebulaDisplay: display.value } }));
  summary.addEventListener('change', () => app.store.set({ phangs: { nebulaSummary: summary.value } }));
  app.events.on('state', ({ changed: keys }) => {
    if (!keys.some(k => ['phangs', 'overlays'].includes(k))) return;
    clearHover();
    if (options().display !== 'summary' && enabled()) loadRegions();
    syncControls();
    ov.invalidate();
  });
  app.events.on('camera', clearHover);
  app.events.on('frame', clearHover);
  app.events.on('phangs:ready', rebuildGroups);

  function draw(ctx) {
    const t0 = performance.now();
    visible = matching = 0;
    if (screen) screen.fill(NaN);
    if (ctx && regionData && enabled() && options().display !== 'summary' && activeAxes() && app.data.loaded) {
      const dims = app.data.dims, F = app.frame, D = dims.length, fade = fadeFactors(F), plot = ov.plotRect();
      const indices = NEBULA_KEYS.map(key => dims.findIndex(d => d.key === key));
      // Zero nebular contributions in the host projection, then add each region's values.
      const centers = Object.fromEntries(indices.filter(i => i >= 0).map(i => [dims[i].key, dims[i].center]));
      ctx.save();
      ctx.beginPath();
      ctx.rect(plot.l, plot.t, plot.r - plot.l, plot.b - plot.t);
      ctx.clip();
      ctx.fillStyle = '#e8b85c';
      for (const { host, entries } of groups) {
        if (!matchesPhangsSurveys(host, app.store.get().phangs?.surveys)) continue;
        matching += entries.length;
        const base = project({ ...baseValues(host), ...centers }, dims, F, fade);
        if (base.vis < .01) continue;
        for (const { region, i, u } of entries) {
          let X = base.X, Y = base.Y, vis = base.vis;
          for (let j = 0; j < indices.length; j++) {
            const d = indices[j];
            if (d < 0) continue;
            if (Number.isFinite(u[j])) { X += F[d] * u[j]; Y += F[D + d] * u[j]; }
            else vis *= fade[d];
          }
          if (vis < .01) continue;
          const [x, y] = app.camera.toScreen(X, Y);
          if (x < plot.l + 2 || x > plot.r - 2 || y < plot.t + 2 || y > plot.b - 2) continue;
          visible++;
          screen[2 * i] = x; screen[2 * i + 1] = y;
          ctx.globalAlpha = .32 * vis;
          ctx.fillRect(x - 1.25, y - 1.25, 2.5, 2.5);
          if (selected()?.nebula === region) {
            ctx.globalAlpha = vis;
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.stroke();
          }
        }
      }
      ctx.restore();
    }
    lastDrawMs = performance.now() - t0;
    controls.setAttribute('data-region-draw-ms', lastDrawMs.toFixed(2));
    controls.setAttribute('data-regions-visible', String(visible));
    syncControls();
  }

  function pick(sx, sy, radius = 6) {
    if (!enabled() || options().display === 'summary' || !activeAxes() || !screen) return null;
    let closest = -1, best = radius * radius;
    for (let i = 0; i < regionData.regions.length; i++) {
      const dx = screen[2 * i] - sx, dy = screen[2 * i + 1] - sy, d2 = dx * dx + dy * dy;
      if (d2 < best) { closest = i; best = d2; }
    }
    if (closest < 0) return null;
    const region = regionData.regions[closest], host = hosts().find(row => row.name === region.galaxy);
    return host && matchesPhangsSurveys(host, app.store.get().phangs?.surveys) ? nebulaRow(host, region) : null;
  }

  app.interaction.addClickHandler?.(({ sx, sy }) => {
    const row = pick(sx, sy);
    if (!row || app.isMoving()) return false;
    inspect(row);
    return true;
  }, 30);
  app.interaction.addHoverHandler?.(point => {
    const row = point && !app.isMoving() ? pick(point.sx, point.sy) : null;
    if (!row) { clearHover(); return false; }
    if (!hovered || hovered.nebula !== row.nebula) {
      hovered = row;
      const i = regionData.regions.indexOf(row.nebula);
      app.events.emit('phangs:hover', { row, sx: screen[2 * i], sy: screen[2 * i + 1] });
    }
    return true;
  });

  const number = value => Number.isFinite(value) ? value.toLocaleString('en-US', { maximumSignificantDigits: 4 }) : 'Unavailable';
  function details(row) {
    const host = summaries.get(row.name), region = row.nebula, method = options().summary;
    const section = h('details', { class: 'phangs-nebula-details' }, h('summary', { text: region ? `MUSE H II region ${region.id}` : 'MUSE nebular properties' }));
    if (!host) {
      section.append(h('p', { text: summaryError || (!catalogue ? 'Loading MUSE summaries…' : 'No H II-region measurements in the supplied MUSE catalogue.') }));
      return section;
    }
    section.append(h('p', { class: 'phangs-note', text: region
      ? 'Stellar mass, total SFR, sSFR, H I fraction and galaxy size are host-galaxy values. Image shows the host galaxy.'
      : `${NEBULA_SUMMARIES[method]}. Catalogued H II regions within the MUSE footprint. This is not an SDSS fibre-aperture measurement.` }));
    if (region) section.append(h('p', { text: `Host: ${row.name.toUpperCase()}. Region RA, Dec: ${Number.isFinite(region.ra) ? region.ra.toFixed(6) : 'Unavailable'}, ${Number.isFinite(region.dec) ? region.dec.toFixed(6) : 'Unavailable'} deg.` }));
    else section.append(h('p', { class: 'phangs-note', text: 'Ranges below are Hα-weighted 16–84% region ranges. Population spread, not measurement uncertainty.' }));
    for (const key of NEBULA_KEYS) {
      const value = region ? region.values[key] : host.values[method][key];
      const stats = host.stats[key];
      const n = method === 'summed' ? host.summed_counts[key] : stats.n;
      section.append(h('p', { text: `${NEBULA_LABELS[key]}: ${number(value)}${region ? '' : ` (${n} regions)`}` }));
      if (!region) section.append(h('small', { class: 'phangs-note', text: `16–84%: ${number(stats.p16)} to ${number(stats.p84)} (${stats.n} regions).` }));
    }
    section.append(h('p', { class: 'phangs-note', text: 'PP04 uses measured line ratios, −1 < O3N2 < 1.9. No T04 metallicity or stellar A_V is inferred.' }));
    const native = h('details', {}, h('summary', { text: 'Native catalogue measurements' }));
    const nativeMethod = method === 'median' ? 'median' : 'mean';
    if (!region) native.append(h('p', { class: 'phangs-note', text: `${NEBULA_SUMMARIES[nativeMethod]}; native quantities are not derived from summed lines.` }));
    const errors = { met_scal: 'met_scal_err', EBV: 'EBV_ERR', logq_D91: 'logq_D91_err' };
    for (const key of Object.keys(host.native)) {
      const stats = host.native[key], value = region ? region.native[key] : stats[nativeMethod];
      const error = region?.native[errors[key]];
      native.append(h('p', { text: `${NEBULA_LABELS[key]}: ${number(value)}${Number.isFinite(value) && Number.isFinite(error) ? ` ± ${number(error)}` : ''}${region ? '' : ` (${stats.n} regions)`}` }));
    }
    if (region) {
      const flags = h('details', {}, h('summary', { text: 'Catalogue selection and flags' }));
      const labels = { flag_edge: 'Near field edge', flag_nearby: 'Touches another nebula', flag_star: 'Overlaps a stellar mask',
        BPT_NII: '[NII] BPT class', BPT_SII: '[SII] BPT class', BPT_OI: '[OI] BPT class', HII_class_v3: 'Classified as H II (v3)' };
      const bpt = { '-1': 'Low signal-to-noise', 0: 'Star-forming', 1: 'Composite', 2: 'LIER', 3: 'AGN' };
      for (const [key, value] of Object.entries(region.flags)) {
        const description = value === null ? 'Unavailable' : key.startsWith('BPT_') ? bpt[value] || 'Unknown' : value === 1 ? 'Yes' : 'No';
        flags.append(h('p', { text: `${labels[key]}: ${description} (${key}=${value}).` }));
      }
      native.append(flags);
    }
    section.append(native, h('p', { class: 'phangs-note', text: `Source: ${catalogue.source}; selection HII_class_v3 = 1. Weight: dust-corrected Hα luminosity.` }));
    return section;
  }

  const ready = read('nebulae_summary.json').then(json => {
    if (!Array.isArray(json.galaxies) || !json.counts) throw new Error('invalid summary');
    catalogue = json;
    summaries = new Map(json.galaxies.map(row => [row.name, row]));
    if (options().display !== 'summary' && enabled()) loadRegions();
    return json;
  }).catch(err => {
    summaryError = `MUSE unavailable (${err.message}).`;
    return null;
  }).finally(() => { changed(); syncControls(); ov.invalidate(); });

  return { ready, controls, values, details, draw, pick, loadRegions, clearHover,
    get hovering() { return !!hovered; },
    get options() { return options(); },
    get activeAxes() { return activeAxes(); },
    get stats() { return { visible, matching, total: regionData?.regions.length || 0, drawMs: lastDrawMs }; } };
}
