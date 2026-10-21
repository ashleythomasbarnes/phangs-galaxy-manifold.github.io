// PHANGS sample, measurement methods and survey provenance.
// Reuses the overlay's small catalogues; opening this panel never loads H II region data.
import { h, fmtInt } from './dom.js';
import { icon } from './icons.js';
import { focusQuietly } from './tooltip.js';

const STATUS_LABELS = {
  released: 'Released',
  observed_not_released: 'Observed, awaiting release',
  awarded_not_observed: 'Awarded, not yet observed',
  intended_not_awarded: 'Intended, time not awarded',
  not_in_survey: 'Outside this survey',
  cannot_be_observed: 'Cannot be observed by this survey',
};
const SURVEY_LABELS = {
  astrosat: 'AstroSat', galex: 'GALEX', halpha: 'Hα imaging', muse: 'MUSE',
  kcwi: 'KCWI', sitelle: 'SITELLE', typhoon: 'TYPHOON', hst: 'HST',
  irac: 'Spitzer IRAC', mips: 'Spitzer MIPS', wise: 'WISE', herschel: 'Herschel',
  alma: 'ALMA', otherco: 'Other CO', hiresco: 'High-resolution CO',
  multijco: 'Multiple CO transitions', dense: 'Dense gas', hi: 'H I',
};

/** Decode the actual recorded statuses without inferring present-day coverage. */
export function phangsSurveyEntries(row) {
  const src = row.source || {};
  return Object.keys(src).filter(k => k.startsWith('survey_') && k.endsWith('_status')).map(k => {
    const id = k.slice(7, -7), raw = src[k];
    return {
      id, label: SURVEY_LABELS[id] || id.toUpperCase(),
      status: STATUS_LABELS[raw] || (raw ? String(raw).replaceAll('_', ' ') : 'Not recorded'),
      instrument: src[`survey_${id}_instrument`] || '',
    };
  });
}

export function initPhangsInfo(app, ui) {
  let root = null, lastFocus = null, content = null;
  let catalogue = app.overlays?.phangs?.catalogue || null;
  let nebulae = null, failed = false, nebulaeLoaded = false, nebulaeReady = null;
  const link = (href, text) => h('a', { href, text, target: '_blank', rel: 'noopener noreferrer' });
  const section = (title, ...children) => h('section', { class: 'ab-sec' }, h('h3', { text: title }), ...children);

  function renderData() {
    if (!root) return;
    const n = catalogue?.galaxies.length;
    const sources = h('ul', { class: 'ab-list pgi-sources' },
      h('li', {}, link('https://phangs.org/', 'PHANGS collaboration')),
      h('li', {}, link('data_phangs/phangs_sample_table_v1p6_README.txt', 'Sample table v1p6 guide'), ' · ',
        link('data_phangs/phangs_sample_table_v1p6.fits', 'FITS source')),
      h('li', {}, link('data_phangs/Nebulae_Readme.txt', 'Internal MUSE nebular catalogue v3 guide'), ' · ',
        link('data_phangs/Nebulae_Catalog_columns_list.xlsx', 'Column definitions')),
      h('li', {}, link('data_phangs/Galaxy Morph Overview - morphclass.csv', 'Galaxy morphology and additional ALMA surveys'), ' · ',
        link('data_phangs/phangs.json', 'Galaxy measurements and source records'), ' · ',
        link('data_phangs/nebulae_summary.json', 'MUSE summary measurements and provenance')));
    content.replaceChildren(
      section('The comparison sample',
        h('p', { text: n ? `${fmtInt(n)} entries from the supplied PHANGS sample table v1p6, including current and possible survey targets. This is a table inventory, not a count of galaxies observed by every survey.` :
          failed ? 'The PHANGS sample table could not be loaded. Reload the page to retry.' : 'Loading the PHANGS sample table…' }),
        h('p', { text: 'PHANGS explores the connections between gas, stars and star formation in nearby galaxies. Observation chips select this comparison sample; the SDSS background and its selections remain independent.' }),
        h('p', { text: 'Available datasets use recorded observations in PHANGS v1p6 and survey membership in the supplied morphology overview. Release stages are not shown. JWST and Chandra coverage is not recorded in v1p6; unrecorded coverage does not imply no observations.' })),
      section('Measurements and comparison limits',
        h('ul', { class: 'ab-list pgi-caveats' },
          h('li', { text: 'PHANGS global stellar masses and SFRs use the table’s WISE/GALEX estimates. SDSS uses MPA-JHU estimates. Their methods differ, and no calibration offsets have been applied.' }),
          h('li', { text: 'The redshift shown for PHANGS is z ≈ vLSR/c, derived from the catalogue systemic velocity; its LSR frame differs from SDSS spectroscopic redshift.' }),
          h('li', { text: 'PHANGS stellar surface density uses M★/(π R90²), a circular area with no inclination correction. SDSS uses M★/(2π R₅₀²). NED model effective radii, when selected for the size axis, are distinct from SDSS Petrosian R₅₀.' }),
          h('li', { text: nebulae ? `${fmtInt(nebulae.counts.hii_regions)} classified H II regions in ${fmtInt(nebulae.counts.galaxies)} galaxies are supplied by the internal MUSE catalogue v3. Summaries cover catalogued H II regions within the MUSE footprint and exclude diffuse emission.` :
            nebulaeLoaded ? 'MUSE nebular summary coverage is unavailable.' : 'Loading MUSE nebular summary coverage…' }),
          h('li', { text: 'MUSE line ratios use fluxes without internal attenuation correction, with positive fluxes and errors and S/N > 3. PP04 O3N2 metallicities use 12 + log(O/H) = 8.73 − 0.32 O3N2 within −1 < O3N2 < 1.9. Matching the calibration does not match the SDSS fibre aperture or classification.' }),
          h('li', { text: 'Galaxy means and medians use dust-corrected Hα luminosity as the weight; means average the displayed logarithmic values. Summed lines instead derives ratios from flux sums. The 16–84% ranges describe region population spread, not measurement error.' }),
          h('li', { text: 'Native S-calibration metallicity and nebular reddening remain distinct from PP04, T04 metallicity and stellar Aᵥ. Individual regions inherit host-galaxy stellar mass, total SFR and other global properties.' }))),
      section('Sources', sources));
  }

  function build() {
    const close = h('button', { type: 'button', class: 'ibtn ab-close', 'aria-label': 'Close PHANGS information', html: icon('close'), onclick: hide });
    content = h('div', { class: 'pgi-content' });
    const panel = h('div', { class: 'ab-panel pgi-panel', role: 'document' },
      h('header', { class: 'ab-head' }, h('div', {}, h('span', { class: 'pgi-eyebrow', text: 'PHANGS Galaxy Manifold' }),
        h('h2', { id: 'phangs-info-title', text: 'PHANGS information' })), close),
      h('details', { class: 'pgi-methods', open: true }, h('summary', { text: 'About the sample, measurements and sources' }), content));
    root = h('div', { class: 'about phangs-info', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'phangs-info-title', hidden: true },
      h('div', { class: 'ab-scrim', onclick: hide }), panel);
    root.addEventListener('keydown', e => {
      e.stopPropagation(); // Global plot shortcuts must not act behind an open dialog.
      if (e.key === 'Escape') { e.preventDefault(); hide(); }
      if (e.key === 'Tab') {
        const focusable = [...root.querySelectorAll('a[href], button, input, summary')].filter(el => !el.disabled && el.offsetParent !== null);
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    });
    document.body.append(root);
    renderData();
  }

  function show() {
    if (root?.classList.contains('open')) return;
    ui.closeMenus?.();
    ui.about?.hide();
    if (!root) build();
    lastFocus = document.activeElement;
    root.hidden = false;
    root.classList.add('open');
    requestAnimationFrame(() => root.querySelector('.ab-close')?.focus({ preventScroll: true }));
  }
  function hide() {
    if (!root?.classList.contains('open')) return;
    root.classList.remove('open');
    root.hidden = true;
    if (lastFocus?.focus && lastFocus.isConnected) focusQuietly(lastFocus);
  }

  function acceptCatalogue(value) {
    catalogue = value;
    failed = !value;
    observeNebulae();
    renderData();
  }
  function observeNebulae() {
    // UI normally starts before overlays. Their catalogue event is the first
    // opportunity to subscribe, even when MUSE summaries have already resolved.
    const ready = app.overlays?.phangs?.nebulae?.ready;
    if (!ready || ready === nebulaeReady) return;
    nebulaeReady = ready;
    ready.then(value => {
      if (ready !== nebulaeReady) return;
      nebulae = value;
      nebulaeLoaded = true;
      renderData();
    });
  }
  app.events.on('phangs:ready', acceptCatalogue);
  app.overlays?.phangs?.ready?.then(acceptCatalogue);
  observeNebulae();

  return {
    show, hide,
    toggle() { if (root?.classList.contains('open')) hide(); else show(); },
    rebuild: renderData,
    get open() { return !!root?.classList.contains('open'); },
  };
}
