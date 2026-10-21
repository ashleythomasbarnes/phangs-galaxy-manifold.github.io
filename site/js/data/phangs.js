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
  { key: 'dss', label: 'DSS', title: 'DSS2 colour', sub: 'Digitized Sky Survey via CDS' },
  { key: 'ls-dr10', label: 'DESI', title: 'DESI Legacy Imaging Surveys DR10', sub: 'Optical imaging via the Legacy Survey viewer' },
  { key: 'sdss', label: 'SDSS', title: 'SDSS', sub: 'g r i' },
  { key: 'ls-dr9', label: 'DR9', title: 'Legacy Surveys DR9', sub: 'g r z' },
];

export function cutoutImageUrl(ra, dec, field, size = 256, layer = 'dss') {
  if (!Number.isFinite(ra) || !Number.isFinite(dec)) return null;
  if (layer === 'dss') {
    const params = new URLSearchParams({ hips: 'CDS/P/DSS2/color', ra: ra.toFixed(6), dec: dec.toFixed(6),
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
