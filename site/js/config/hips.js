// Local display layers; this URL may also point at a CORS-enabled external host.
export const NGC628_HIPS = {
  url: 'data_phangs/hips/ngc0628-f770w/',
  fovDeg: 1 / 60, // One arcminute across, centred on the catalogue galaxy position.
};

export function hasHipsDemo(row) {
  return /^ngc0*628$/i.test(String(row?.name || '').replace(/\s/g, ''));
}
