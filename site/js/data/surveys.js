// Observation coverage from the supplied PHANGS v1p6 table, never inferred from names.
export const PHANGS_SURVEYS = [
  { id: 'alma', label: 'ALMA', field: 'alma', color: '#7de2d1', desc: 'Molecular gas · CO observations' },
  { id: 'muse', label: 'MUSE', field: 'muse', color: '#e8b85c', desc: 'Optical integral-field spectroscopy' },
  { id: 'hst', label: 'HST', field: 'hst', color: '#85b8e3', desc: 'Resolved stellar populations · optical imaging' },
  { id: 'jwst', label: 'JWST', color: '#dc9771', desc: 'Infrared imaging', missing: 'JWST coverage is not recorded in the supplied v1p6 table.' },
  { id: 'chandra', label: 'Chandra', color: '#bc97c9', desc: 'X-ray observations', missing: 'Chandra coverage is not recorded in the supplied v1p6 table.' },
  { id: 'vla', label: 'VLA', field: 'hi', instrument: 'VLA', color: '#95bda3', desc: 'Atomic gas · H I observations' },
  { id: 'meerkat', label: 'MeerKAT', field: 'hi', instrument: 'MeerKAT', color: '#c7c284', desc: 'Atomic gas · H I observations' },
];

export const ALMA_ARRAYS = [
  { id: 'any', label: 'Any array' },
  { id: 'full', label: '12m + 7m + TP' },
  { id: 'compact', label: '7m + TP' },
];

export const ALMA_PROGRAMS = [
  { id: 'any', label: 'Data available' },
  { id: 'nominal', label: 'Nominal PHANGS' },
  { id: 'ecmz', label: 'eCMZ' },
  { id: 'almond', label: 'ALMOND' },
];

export function surveyStatus(row, survey) {
  if (!survey.field) return null;
  const src = row.source || {};
  if (survey.instrument && !(src.survey_hi_instrument || '').split(/\s*[;&+]\s*/).some(s => s.toLowerCase() === survey.instrument.toLowerCase())) return null;
  return src[`survey_${survey.field}_status`] || null;
}

export function almaArray(row) {
  const parts = (row.source?.survey_alma_instrument || '').toLowerCase().split(/[;+]/).map(s => s.trim()).sort().join(';');
  return parts === '12m;7m;tp' ? 'full' : parts === '7m;tp' ? 'compact' : null;
}

export function matchesSurvey(row, survey, filter = { status: 'observed', array: 'any' }) {
  if (survey.id === 'alma') {
    const overview = row.morphology_overview;
    const program = filter.program || 'nominal';
    if (program === 'ecmz') return overview?.ecmz === 'CMZ';
    if (program === 'almond') return overview?.dense_gas_surveys?.includes('A') || false;
    if (program === 'any') return matchesSurvey(row, survey, { ...filter, program: 'nominal' }) ||
      overview?.ecmz === 'CMZ' || (overview?.dense_gas_surveys?.includes('A') || false);
  }
  const status = surveyStatus(row, survey);
  const observed = status === 'released' || status === 'observed_not_released';
  if (filter.status === 'observed' || !filter.status ? !observed : status !== filter.status) return false;
  return survey.id !== 'alma' || !filter.array || filter.array === 'any' || almaArray(row) === filter.array;
}

export function normalizeSurveyFilters(filters = {}) {
  return Object.fromEntries(PHANGS_SURVEYS.map(s => {
    const f = filters?.[s.id];
    const valid = s.field && f && ['observed', 'released', 'observed_not_released', 'awarded_not_observed'].includes(f.status || 'observed');
    return [s.id, valid ? { status: 'observed', array: s.id === 'alma' && ALMA_ARRAYS.some(a => a.id === f.array) ? f.array : 'any',
      ...(s.id === 'alma' ? { program: ALMA_PROGRAMS.some(p => p.id === f.program) ? f.program : 'nominal' } : {}) } : null];
  }));
}

export function matchesPhangsSurveys(row, filters = {}) {
  return PHANGS_SURVEYS.every(s => !filters?.[s.id] || matchesSurvey(row, s, filters[s.id]));
}
