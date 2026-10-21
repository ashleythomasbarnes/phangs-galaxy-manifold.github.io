// These four properties share the SDSS definitions. Native S-calibration and nebular
// reddening deliberately never populate the T04 OH or stellar AV dimensions.
export const NEBULA_KEYS = ['N2Ha', 'O3Hb', 'HaHb', 'OH_PP04'];
export const NEBULA_DISPLAYS = { summary: 'Galaxy summaries', regions: 'H II regions', both: 'Both' };
export const NEBULA_SUMMARIES = { mean: 'Hα-weighted mean', median: 'Hα-weighted median', summed: 'Summed lines' };
export const NEBULA_LABELS = {
  N2Ha: 'log [NII]/Hα', O3Hb: 'log [OIII]/Hβ', HaHb: 'log Hα/Hβ', OH_PP04: '12+log(O/H), PP04 O3N2',
  met_scal: '12+log(O/H), native S-calibration', Delta_met_scal: 'S-calibration radial residual (dex)',
  EBV: 'Nebular E(B−V) (mag)', logq_D91: 'log q, Díaz 1991', Lum_HA6562_CORR: 'Dust-corrected Hα luminosity (erg/s)',
};

export function nebulaOptions(state = {}) {
  return {
    display: Object.hasOwn(NEBULA_DISPLAYS, state.nebulaDisplay) ? state.nebulaDisplay : 'summary',
    summary: Object.hasOwn(NEBULA_SUMMARIES, state.nebulaSummary) ? state.nebulaSummary : 'mean',
  };
}

export function hasNebulaAxes(dims, F) {
  return dims.some((d, i) => NEBULA_KEYS.includes(d.key) && Math.hypot(F[i], F[dims.length + i]) > 1e-6);
}

export function nebulaValues(row, base, summary, method = 'mean') {
  const measured = row.nebula?.values || summary?.values[method];
  return measured ? { ...base, ...measured } : base;
}

// The image and global properties remain those of the host. Region coordinates are
// displayed separately, and its measured nebular properties override host summaries.
export function nebulaRow(host, region) {
  return { ...host, nebula: region };
}
