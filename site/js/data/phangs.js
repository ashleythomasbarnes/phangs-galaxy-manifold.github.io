// Image field is for presentation only; PHANGS size is never mapped to SDSS R50.
export function phangsValues(row, sizeMode = 'none') {
  if (sizeMode !== 'ned-exponential') return row.values;
  const radius = row.ned_exponential_size?.kpc;
  return { ...row.values, logR50: Number.isFinite(radius) && radius > 0 ? Math.log10(radius) : null };
}

export function phangsImageField(row) {
  const radius = row.source.size_r25;
  return Number.isFinite(radius) && radius > 0 ? Math.max(60, 2.4 * radius) : 240;
}

export const IMAGE_LAYERS = [
  { key: 'dss', label: 'DSS', title: 'DSS2 colour', sub: 'Digitized Sky Survey via CDS', hips: 'CDS/P/DSS2/color' },
  { key: 'ls-dr10', label: 'DESI', title: 'DESI Legacy Imaging Surveys DR10', sub: 'Optical imaging via the Legacy Survey viewer' },
  { key: 'sdss', label: 'SDSS', title: 'SDSS', sub: 'g r i' },
  { key: 'ls-dr9', label: 'DR9', title: 'Legacy Surveys DR9', sub: 'g r z' },
  // HiPS identifiers are registered in the CDS MOC server and served by HiPS2FITS.
  { key: '2mass', label: '2MASS', title: '2MASS near-infrared colour', sub: 'J, H and Kₛ composite · UMass/IPAC via CDS', hips: 'CDS/P/2MASS/color' },
  { key: 'galex', label: 'GALEX', title: 'GALEX GR6/7 ultraviolet colour', sub: 'FUV and NUV composite · STScI/NASA via CDS; coverage varies', hips: 'CDS/P/GALEXGR6_7/color' },
  { key: 'allwise', label: 'AllWISE', title: 'AllWISE infrared colour', sub: 'W4 (red), W2 (green), W1 (blue) · IPAC/NASA via CDS', hips: 'CDS/P/allWISE/color' },
  { key: 'xmm', label: 'XMM', title: 'XMM-Newton EPIC X-ray colour', sub: 'ESA EPIC composite via CDS HiPS2FITS; pointed observations, coverage varies', hips: 'ESDC/P/XMM/EPIC-RGB' },
];

export function cutoutImageUrl(ra, dec, field, size = 256, layer = 'dss') {
  if (!Number.isFinite(ra) || !Number.isFinite(dec)) return null;
  const hips = IMAGE_LAYERS.find(spec => spec.key === layer)?.hips;
  if (hips) {
    const params = new URLSearchParams({ hips, ra: ra.toFixed(6), dec: dec.toFixed(6),
      width: String(size), height: String(size), fov: String(field / 3600),
      projection: 'TAN', coordsys: 'icrs', rotation_angle: '0', format: 'jpg' });
    return `https://alasky.cds.unistra.fr/hips-image-services/hips2fits?${params}`;
  }
  return `https://www.legacysurvey.org/viewer/cutout.jpg?ra=${ra.toFixed(6)}&dec=${dec.toFixed(6)}&layer=${layer}&pixscale=${(field / size).toFixed(6)}&size=${size}`;
}

export function phangsImageUrl(row, size = 256, layer = 'dss') {
  if (!Number.isFinite(row.ra) || !Number.isFinite(row.dec)) return null;
  return cutoutImageUrl(row.ra, row.dec, phangsImageField(row), size, layer);
}
