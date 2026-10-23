// Independent comparison sample: never inserted into the SDSS rows or selection mask.
import { fadeFactors } from '../../math/frame.js';
import { h } from '../../ui/dom.js';
import { COLORS } from '../../config/style.js';
import { phangsValues, phangsImageUrl } from '../../data/phangs.js?v=3';
import { matchesPhangsSelection, phangsTableContext } from '../../data/phangs-table.js';
import { PHANGS_SURVEYS, ALMA_ARRAYS, ALMA_PROGRAMS } from '../../data/surveys.js?v=2';
import { createNebulae } from './nebulae.js';
import { phangsDataChips } from '../../ui/phangs-chips.js?v=2';


/** Size-dependent comparisons also matter in mixed/rotating projections. */
export function hasPhangsSizeAxes(dims, F) {
  return hasAxis(dims, F, 'logR50') || hasAxis(dims, F, 'logSigma');
}

function hasAxis(dims, F, key) {
  return dims.some((d, i) => d.key === key
    && Math.hypot(F[i], F[dims.length + i]) > 1e-6);
}

/** Same standardized projection and missing-axis fade as the SDSS renderer. */
export function projectPhangs(values, dims, F, fade = fadeFactors(F)) {
  let X = 0, Y = 0, vis = 1;
  for (let d = 0; d < dims.length; d++) {
    const x = values[dims[d].key];
    if (!Number.isFinite(x)) { vis *= fade[d]; continue; }
    const u = (x - dims[d].center) / dims[d].scale;
    X += F[d] * u;
    Y += F[dims.length + d] * u;
  }
  return { X, Y, vis };
}

export function createPhangs(app, ov) {
  const { data } = app;
  const count = h('span', { text: 'Loading…' });
  const status = h('div', { class: 'phangs-status', role: 'status' });
  const sizeSelect = h('select', { 'aria-label': 'PHANGS size comparison' },
    h('option', { value: 'none', text: 'Not mapped' }),
    h('option', { value: 'ned-exponential', text: 'NED r-band exponential Rₑ' }));
  const sizeNote = h('small', { class: 'phangs-size-note', hidden: true,
    text: 'R₅₀ axis: NED model semi-major Rₑ, distinct from SDSS Petrosian R₅₀.' });
  const sizeControl = h('label', { class: 'phangs-size-control', hidden: true },
    h('span', { text: 'Size axis' }), sizeSelect);
  const sigmaNote = h('small', { class: 'phangs-sigma-note', hidden: true,
    text: 'PHANGS Σ★ = M★/(π R90²); SDSS uses M★/(2π R₅₀²).' });
  const sizeControls = h('div', { class: 'phangs-size-controls', hidden: true },
    sizeControl, sizeNote, sigmaNote);
  const controls = h('section', { class: 'phangs-controls', 'aria-label': 'PHANGS comparison sample', hidden: true },
    h('div', { class: 'phangs-controls-heading' }, h('b', { text: 'PHANGS' }), count), status, sizeControls);
  const filterSummary = h('small', { class: 'phangs-filter-summary', hidden: true });
  controls.append(filterSummary);
  const markers = h('div', { class: 'phangs-markers' });
  const details = h('section', { class: 'phangs-properties', 'aria-label': 'PHANGS provenance and counterpart', hidden: true });
  ov.layer.append(markers, controls);

  let catalogue = null, selected = null, loadError = '', supported = 0;
  let lastCount = '';
  let counterpartState = '', counterpartPoint = null;
  const nodes = [];
  const ring = h('div', { class: 'phangs-counterpart', hidden: true, 'aria-hidden': 'true' });
  markers.append(ring);
  const enabled = () => app.store.get().overlays.phangs !== false;
  const surveyFilters = () => app.store.get().phangs?.surveys || {};
  const matches = row => matchesPhangsSelection(row, app.store.get().phangs, phangsTableContext(app));
  const sizeMode = () => app.store.get().phangs?.sizeMode || 'none';
  const values = row => nebulae.values(row, phangsValues(row, sizeMode()));
  const imagesEnabled = () => app.store.get().phangs?.images === true && data.manifest?.host?.externalImages !== false;
  let lastSizeMode = sizeMode(), lastSummary = 'mean';
  const clearSDSSHover = () => {
    app.interaction.clearHover();
    app.events.emit('hover', { index: -1, sx: 0, sy: 0 });
  };
  controls.addEventListener('pointerenter', clearSDSSHover);
  details.addEventListener('pointerenter', clearSDSSHover);
  const nebulae = createNebulae(app, ov, {
    hosts: () => catalogue?.galaxies || [], baseValues: row => phangsValues(row, sizeMode()),
    project: projectPhangs, matches, inspect, selected: () => selected,
    changed: () => { if (selected && !matches(selected)) close(); renderDetails(); app.events.emit('phangs:measurements'); ov.invalidate(); },
  });
  controls.append(nebulae.controls);

  // Tiles let stage gestures pass through. Picking here keeps pan, zoom and
  // lasso available even when a drag starts on an image; keyboard clicks use
  // the same accessible marker button as before.
  let tileHovered = null;
  function pickTile(sx, sy) {
    if (!enabled() || !imagesEnabled()) return null;
    const hits = nodes.filter(n => n.tile && !n.button.hidden && Math.abs(sx - n.sx) <= 24 && Math.abs(sy - n.sy) <= 24);
    return hits.find(n => n.row === selected) || hits[hits.length - 1] || null;
  }
  app.interaction.addClickHandler?.(({ sx, sy }) => {
    const hit = pickTile(sx, sy);
    if (!hit || app.isMoving()) return false;
    inspect(hit.row);
    return true;
  }, 20);
  app.interaction.addHoverHandler?.(point => {
    const hit = point && !app.isMoving() ? pickTile(point.sx, point.sy) : null;
    if (!hit) {
      if (tileHovered) app.events.emit('phangs:hover', { row: null });
      tileHovered = null;
      return false;
    }
    if (tileHovered !== hit) {
      tileHovered = hit;
      app.events.emit('phangs:hover', { row: hit.row, sx: hit.sx, sy: hit.sy });
    }
    return true;
  });

  function close() {
    selected = null;
    tileHovered = null;
    nebulae.clearHover();
    details.hidden = true;
    app.events.emit('phangs:hover', { row: null });
    ring.hidden = true;
    counterpartPoint = null;
    app.events.emit('phangs:closed');
    ov.invalidate();
  }

  function counterpart(row) {
    const match = row.match;
    if (match.status === 'unmatched') return { message: 'No counterpart found within 10 arcsec' };
    if (match.status === 'ambiguous') return { message: `${match.candidates.length} SDSS candidates within 10 arcsec; match ambiguous` };
    if (match.status !== 'matched') return { message: 'Coordinates unavailable for matching' };
    const c = match.candidates[0];
    if (data.base !== 'data' || data.n !== catalogue.sdss.n || data.manifest.created !== catalogue.sdss.created)
      return { message: 'Counterpart unavailable: this background differs from the matched SDSS export' };
    if (!data.meta.loaded) return { message: 'Loading SDSS counterpart coordinates…' };
    if (data.meta.ra?.[c.index] !== c.ra || data.meta.dec?.[c.index] !== c.dec)
      return { message: 'Counterpart unavailable: SDSS row coordinates could not be verified' };
    if (!data.loaded) return { message: 'Loading SDSS measurements…' };
    const p = app.proj.projectSample([c.index], app.frame, { filters: app.filterParams() });
    return { candidate: c, point: { X: p.X[0], Y: p.Y[0] },
      message: p.vis[0] >= 0.01 ? 'SDSS counterpart outlined in white' : 'SDSS counterpart hidden by filters or missing axis values',
      visible: p.vis[0] >= 0.01 };
  }

  const number = (x, digits = 3) => Number.isFinite(x) ? x.toLocaleString('en-US', { maximumSignificantDigits: digits }) : 'Unavailable';
  function renderDetails() {
    if (!selected) return;
    const row = selected, src = row.source;
    const cp = counterpart(row);
    counterpartState = cp.message;
    const list = h('dl');
    const add = (label, value) => list.append(h('dt', { text: label }), h('dd', { text: value }));
    add('PGC', src.pgc ?? 'Unavailable');
    add('RA, Dec (deg)', `${number(row.ra, 7)}, ${number(row.dec, 7)}`);
    add('Distance (Mpc)', `${number(src.dist)}${Number.isFinite(src.dist_unc) ? ` (uncertainty ${number(src.dist_unc)} dex)` : ''}`);
    add('Systemic velocity, LSR (km s⁻¹)', `${number(src.orient_vlsr, 6)}${Number.isFinite(src.orient_vlsr_unc) ? ` ± ${number(src.orient_vlsr_unc)}` : ''}`);
    add('Approximate LSR redshift, vLSR/c', number(row.values.z, 6));
    add('Systemic velocity reference', src.orient_vlsr_ref || 'Unavailable');
    for (const [field, label, unit] of [['props_mstar', 'Stellar mass', 'M☉'], ['props_sfr', 'SFR', 'M☉ yr⁻¹'], ['props_mhi', 'H I mass', 'M☉']]) {
      add(`${label} (${unit})`, `${number(src[field])}${Number.isFinite(src[field]) && Number.isFinite(src[`${field}_unc`]) ? ` ± ${number(src[`${field}_unc`])}` : ''}`);
    }
    for (const key of ['logM', 'logSFR', 'logsSFR', 'logfHI']) add(key, number(row.values[key], 4));
    add('Σ★ = M★/(π R90²) (M☉ kpc⁻²)', number(Number.isFinite(row.values.logSigma) ? 10 ** row.values.logSigma : null));
    add('log Σ★ (R90; M☉ kpc⁻²)', number(row.values.logSigma, 4));
    const sfrMethods = { FUVW4: 'GALEX FUV + WISE W4 (FUVW4)', NUVW4: 'GALEX NUV + WISE W4 (NUVW4)', W4ONLY: 'WISE W4 only (W4ONLY)' };
    add('SFR method', sfrMethods[src.props_sfr_method] || src.props_sfr_method || 'Unavailable');
    add('Mass-to-light method', src.props_mtol_method || 'Unavailable');
    add('Distance reference', src.dist_ref || 'Unavailable');
    const sizeList = h('details', { class: 'phangs-sizes' }, h('summary', { text: 'PHANGS sizes' }),
      h('p', { class: 'phangs-note', text: 'Physical radii use the PHANGS distance. These are distinct size definitions, not SDSS Petrosian R50.' }));
    for (const [key, name] of [['size_r90', 'R90'], ['size_r25', 'R25'], ['size_reff', 'Effective radius Rₑ'], ['size_scalelength', 'Stellar scale length']]) {
      const size = row.sizes?.[key];
      if (!size) continue;
      const angular = `${number(size.arcsec)}${Number.isFinite(size.arcsec) && Number.isFinite(size.unc_arcsec) ? ` ± ${number(size.unc_arcsec)}` : ''} arcsec`;
      const physical = `${number(size.kpc)}${Number.isFinite(size.kpc) && Number.isFinite(size.unc_kpc) ? ` ± ${number(size.unc_kpc)}` : ''} kpc`;
      sizeList.append(h('p', { text: `${name}: ${angular}; ${physical}` }));
    }
    sizeList.append(h('p', { class: 'phangs-note', text: 'kpc uncertainties combine angular-size and distance uncertainties in quadrature, assuming independence.' }));
    const ns = row.ned_exponential_size;
    if (ns) sizeList.append(h('p', { text: `NED r-band exponential semi-major Rₑ: ${number(ns.arcsec)}${Number.isFinite(ns.unc_arcsec) ? ` ± ${number(ns.unc_arcsec)}` : ''} arcsec; ${number(ns.kpc)}${Number.isFinite(ns.unc_kpc) ? ` ± ${number(ns.unc_kpc)}` : ''} kpc. Reference: ${ns.reference}. Model effective radius; not Petrosian R₅₀.` }));
    const ned = row.ned_sizes;
    const nedList = h('details', { class: 'phangs-ned' }, h('summary', { text: 'NED size measurements' }));
    if (ned?.status === 'ok') {
      const half = ned.measurements.filter(m => m.optical_half_light || m.petrosian_r50);
      nedList.append(h('p', { text: `${ned.measurements.length} diameter records; ${half.length} explicitly identified optical half-light measurements.` }));
      if (!half.length) nedList.append(h('p', { text: 'No explicitly identified optical half-light measurement in this NED response.' }));
      for (const m of half) {
        const radius = Number.isFinite(m.dia_maj) && m.dia_maj > 0 ? m.dia_maj / 2 : null;
        nedList.append(h('p', { text: `${m.freq_target}: ${number(radius)} arcsec semi-major radius${radius !== null && Number.isFinite(m.dia_unc_maj) && m.dia_unc_maj > 0 ? ` ± ${number(m.dia_unc_maj / 2)}` : ''}. ${m.dia_type}. Reference: ${m.refcode}.` }));
      }
      nedList.append(h('p', { class: 'phangs-note', text: 'Model effective radii are not Petrosian R50. Generic Petrosian diameter records are not treated as half-light sizes.' }));
    } else nedList.append(h('p', { text: ned ? 'NED size query unavailable; no values substituted.' : 'NED sizes have not been fetched.' }));
    if (ned?.query_url) nedList.append(h('a', { href: ned.query_url, target: '_blank', rel: 'noopener noreferrer', text: 'NED source records (VOTable)' }));
    const aliases = h('details', {}, h('summary', { text: 'Other names' }), h('p', { text: src.alias || 'Unavailable' }));
    const surveys = h('details', {}, h('summary', { text: 'Available datasets' }));
    for (const entry of phangsDataChips(row)) surveys.append(h('p', { text: entry.label }));
    const sdss = h('details', { class: 'phangs-sdss' }, h('summary', { text: row.nebula ? 'Host SDSS counterpart' : 'SDSS counterpart' }), h('p', { class: 'phangs-match-state', text: cp.message }));
    if (cp.candidate) {
      sdss.append(h('p', { text: `Row ${cp.candidate.index}; separation ${cp.candidate.separation_arcsec.toFixed(2)} arcsec` }));
      for (const key of ['logM', 'logSFR', 'logsSFR', 'logfHI'])
        sdss.append(h('p', { text: `${key}: ${number(data.value(cp.candidate.index, key), 4)}` }));
    }
    const measurements = h('details', {}, h('summary', { text: 'Global measurements and references' }), list);
    const provenance = h('details', {}, h('summary', { text: 'Catalogue provenance and comparison limits' }),
      h('p', { class: 'phangs-note', text: catalogue.notes }));
    details.replaceChildren(nebulae.details(row), sdss, sizeList, nedList, measurements, aliases, surveys, provenance);
    details.hidden = false;
  }

  function inspect(row) {
    clearSDSSHover();
    app.actions.inspect(null); // close the SDSS drawer without changing lasso selection
    selected = row;
    app.events.emit('phangs:hover', { row: null });
    renderDetails();
    app.events.emit('phangs:inspect', { row, details });
    ov.invalidate();
  }

  sizeSelect.addEventListener('change', () => {
    app.store.set({ phangs: { sizeMode: sizeSelect.value } });
  });
  app.events.on('inspect', close);
  app.events.on('data:meta', () => { renderDetails(); ov.invalidate(); });
  app.events.on('state', ({ changed }) => {
    if (changed.includes('overlays') && !enabled()) close();
    if (changed.includes('phangs')) {
      tileHovered = null;
      if (selected && !matches(selected)) close();
      if (selected?.nebula && nebulae.options.display === 'summary') close();
      app.events.emit('phangs:hover', { row: null });
      ov.invalidate();
    }
    if (changed.includes('phangs') && (lastSizeMode !== sizeMode() || lastSummary !== nebulae.options.summary)) {
      const sizeChanged = lastSizeMode !== sizeMode();
      lastSizeMode = sizeMode();
      lastSummary = nebulae.options.summary;
      renderDetails();
      app.events.emit('phangs:hover', { row: null });
      if (sizeChanged) app.events.emit('phangs:size', { mode: sizeMode() });
      app.events.emit('phangs:measurements');
      ov.invalidate();
    }
  });
  app.layers.stage.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

  function draw(ctx) {
    const on = enabled();
    const radiusActive = hasAxis(data.dims, app.frame, 'logR50');
    const sigmaActive = hasAxis(data.dims, app.frame, 'logSigma');
    const sizeActive = radiusActive || sigmaActive;
    controls.hidden = !on || (!sizeActive && !nebulae.activeAxes);
    sizeControls.hidden = !sizeActive;
    nebulae.controls.hidden = !nebulae.activeAxes;
    sizeSelect.value = sizeMode();
    sizeControl.hidden = !radiusActive;
    sizeNote.hidden = !radiusActive || sizeMode() !== 'ned-exponential';
    sigmaNote.hidden = !sigmaActive;
    const fade = fadeFactors(app.frame), plot = ov.plotRect();
    nebulae.draw(ctx);
    const showSummaries = nebulae.options.display !== 'regions' || !nebulae.activeAxes;
    controls.style.right = `${(ov.cover?.r || 0) + 12}px`;
    let visible = 0, matching = 0;
    supported = 0;
    const activeSurveys = PHANGS_SURVEYS.filter(s => surveyFilters()[s.id]);
    filterSummary.hidden = !activeSurveys.length;
    filterSummary.textContent = activeSurveys.map(s => {
      const f = surveyFilters()[s.id];
      const array = s.id === 'alma' && f.array !== 'any' ? ALMA_ARRAYS.find(a => a.id === f.array)?.label : null;
      const program = s.id === 'alma' ? ALMA_PROGRAMS.find(p => p.id === f.program)?.label : null;
      return `${s.label}${program ? ` · ${program}` : ''}${array ? ` (${array})` : ''}`;
    }).join(' + ');
    const markerColor = activeSurveys.length === 1 ? activeSurveys[0].color : activeSurveys.length > 1 ? COLORS.cream : COLORS.phangs;
    const images = imagesEnabled();
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i], { button, label } = node, row = catalogue.galaxies[i];
      const match = matches(row);
      if (match) matching++;
      const p = projectPhangs(values(row), data.dims, app.frame, fade);
      if (match && p.vis >= 0.01) supported++;
      const [x, y] = app.camera.toScreen(p.X, p.Y);
      node.sx = x; node.sy = y;
      const edge = images ? 25 : 7;
      const show = on && showSummaries && match && data.loaded && p.vis >= 0.01 && x >= plot.l + edge && x <= plot.r - edge && y >= plot.t + edge && y <= plot.b - edge;
      button.hidden = !show;
      if (show && images && !node.image && !node.imageFailed && !app.isMoving()) {
        const url = phangsImageUrl(row, 96, 'dss');
        if (url) {
          node.image = h('img', { alt: '', width: '48', height: '48', decoding: 'async', draggable: 'false' });
          node.image.onload = () => { node.imageReady = true; ov.invalidate(); };
          node.image.onerror = () => {
            node.imageFailed = true;
            button.setAttribute('aria-label', `Inspect PHANGS galaxy ${row.name.toUpperCase()}, DSS image unavailable`);
            ov.invalidate();
          };
          button.append(node.image);
          node.image.src = url;
        }
      }
      const tile = images && node.imageReady && !node.imageFailed;
      if (node.tile !== tile) {
        node.tile = tile;
        button.setAttribute('class', tile ? 'phangs-marker phangs-image' : 'phangs-marker');
      }
      if (node.image) node.image.hidden = !tile;
      if (show) {
        visible++;
        button.style.borderColor = markerColor;
        button.style.background = activeSurveys.length ? markerColor + '55' : COLORS.bg + '40';
        button.style.transform = `translate(${x}px,${y}px)`;
        button.style.opacity = p.vis;
        button.style.zIndex = selected === row ? '2' : '';
      }
      label.hidden = !show || selected !== row;
    }
    const regionStats = nebulae.stats;
    count.textContent = catalogue ? regionStats.visible ? `${visible} galaxies · ${regionStats.visible.toLocaleString()} H\u00a0II` : `${visible} visible · ${matching} selected` : 'Unavailable';
    const countKey = `${visible}/${nodes.length}/${matching}/${supported}/${on}/${regionStats.visible}`;
    if (lastCount !== countKey) {
      lastCount = countKey;
      app.events.emit('phangs:count', { visible, total: nodes.length, matching, supported, enabled: on, regionsVisible: regionStats.visible });
    }
    status.textContent = loadError || (!on ? 'Overlay off' : !catalogue ? 'Loading PHANGS…' : !data.loaded ? 'Loading SDSS axes…' :
      matching === 0 ? 'No PHANGS galaxies match these observation filters.' :
      supported === 0 ? 'Current axes lack PHANGS measurements.' : visible === 0 && regionStats.visible === 0 && showSummaries ? 'PHANGS galaxies are outside the current view.' : '');
    ring.hidden = true;
    counterpartPoint = null;
    if (on && selected) {
      const cp = counterpart(selected);
      if (counterpartState !== cp.message) renderDetails();
      counterpartPoint = cp.point || null;
      if (cp.visible) {
        const [x, y] = app.camera.toScreen(cp.point.X, cp.point.Y);
        ring.hidden = x < plot.l + 9 || x > plot.r - 9 || y < plot.t + 9 || y > plot.b - 9;
        ring.style.transform = `translate(${x}px,${y}px)`;
      }
    }
  }

  const ready = fetch('data_phangs/phangs.json', { cache: 'no-cache' }).then(async (res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (!Array.isArray(json.galaxies) || !json.sdss || json.version !== 'v1p6') throw new Error('invalid catalogue');
    catalogue = json;
    for (const row of catalogue.galaxies) {
      const label = h('span', { class: 'phangs-name', text: row.name.toUpperCase(), hidden: true });
      const button = h('button', { type: 'button', class: 'phangs-marker', hidden: true,
        'aria-label': `Inspect PHANGS galaxy ${row.name.toUpperCase()}`, onclick: () => inspect(row) }, label);
      const hover = () => {
        if (app.isMoving() || !enabled()) return;
        clearSDSSHover();
        const p = projectPhangs(values(row), data.dims, app.frame);
        const [x, y] = app.camera.toScreen(p.X, p.Y);
        app.events.emit('phangs:hover', { row, sx: x, sy: y });
      };
      button.addEventListener('pointerenter', hover);
      button.addEventListener('focus', hover);
      button.addEventListener('pointerleave', () => app.events.emit('phangs:hover', { row: null }));
      button.addEventListener('blur', () => app.events.emit('phangs:hover', { row: null }));
      markers.append(button);
      nodes.push({ button, label, row });
    }
    app.events.emit('phangs:ready', catalogue);
    ov.invalidate();
    return catalogue;
  }).catch((err) => {
    app.events.emit('phangs:ready', null);
    loadError = `PHANGS unavailable (${err.message}).`;
    ov.invalidate();
    return null;
  });

  return { ready, draw, close, inspect, nebulae, get catalogue() { return catalogue; },
    values,
    get sizeMode() { return sizeMode(); },
    project: row => projectPhangs(values(row), data.dims, app.frame),
    get hovering() { return !!tileHovered || nebulae.hovering || controls.matches(':hover') || (!details.hidden && details.matches(':hover')) || nodes.some(n => !n.button.hidden && n.button.matches(':hover')); },
    get selected() { return selected?.name || null; },
    get counterpartPoint() { return counterpartPoint; } };
}
