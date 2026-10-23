// Visual design constants (DESIGN.md §3, §7). CSS mirrors these as custom properties in
// css/tokens.css; JS code (canvas/WebGL drawing) reads them from here.

const DARK = {
  bg: '#0b0e13',
  bg2: '#11161f',
  bg3: '#18202c',
  line: '#273142',
  cream: '#efe6d2',
  cream2: '#b8af9a',
  cream3: '#7a7465',
  orange: '#e8743b',
  mustard: '#e2b23a',
  teal: '#3aa6a0',
  sky: '#6fa8dc',
  coral: '#de5b52',
  olive: '#a3b35b',
  plum: '#b07aa1',
  phangs: '#7de2d1',
  gas: '#8fd0e8',
  dust: '#b98a5e',
  selection: '#f2b27a',
  nebula: '#e8b85c',
  mark: '#ffffff',
};

/** Light theme ("paper"): dark ink on warm paper, accents darkened for contrast. */
const LIGHT = {
  bg: '#f3eee3',
  bg2: '#faf7f0',
  bg3: '#e9e2d3',
  line: '#d3c9b5',
  cream: '#1f1b15',
  cream2: '#4d473b',
  cream3: '#807865',
  orange: '#c95a22',
  mustard: '#a87d12',
  teal: '#23807b',
  sky: '#3e7bb8',
  coral: '#c2403a',
  olive: '#6f7d2c',
  plum: '#8e5280',
  phangs: '#16857a',
  gas: '#2f8fb0',
  dust: '#8f6233',
  selection: '#c4561c',
  nebula: '#b07d1a',
  mark: '#1f1b15',
};

const PALETTES = { dark: DARK, light: LIGHT };

/** Current theme name; set by applyTheme(). */
export const THEME = { name: 'dark' };

export const COLORS = { ...DARK };

/** Dimension group → color (rail tokens, compass spokes). */
export const GROUP_COLORS = {
  stars: COLORS.orange,
  sf: COLORS.sky,
  chem: COLORS.mustard,
  struct: COLORS.teal,
  kin: COLORS.coral,
  gas: COLORS.gas,
  dust: COLORS.dust,
  env: COLORS.plum,
  lines: COLORS.olive,
  obs: COLORS.cream3,
  learned: COLORS.cream,
};

export function groupColor(group) {
  return GROUP_COLORS[group] || COLORS.cream2;
}

/** Group color as a CSS custom property (css/tokens.css --g-*), so DOM follows the theme. */
export function groupVar(group) {
  return GROUP_COLORS[group] ? `var(--g-${group})` : 'var(--cream-2)';
}

/** Category code → color (§7). Code 0 (missing) renders as the neutral cream. */
const CATEGORY_PALETTES = {
  dark: {
    bpt: { 1: '#6fa8dc', 2: '#9cc3e4', 3: '#3aa6a0', 4: '#de5b52', 5: '#e8743b', 6: '#e2b23a', 7: '#7a7465' },
    env: { 1: '#efe6d2', 2: '#e2b23a', 3: '#b07aa1' },
    morph: { 1: '#de5b52', 2: '#6fa8dc', 3: '#7a7465' },
  },
  light: {
    bpt: { 1: '#3e7bb8', 2: '#6b9fcf', 3: '#23807b', 4: '#c2403a', 5: '#c95a22', 6: '#a87d12', 7: '#807865' },
    env: { 1: '#1f1b15', 2: '#a87d12', 3: '#8e5280' },
    morph: { 1: '#c2403a', 2: '#3e7bb8', 3: '#807865' },
  },
};
export const CATEGORY_COLORS = structuredClone(CATEGORY_PALETTES.dark);

/** Neutral color for pixels/galaxies without color information (live binding). */
export let NEUTRAL = COLORS.cream;

/** Selection highlight ("warm cream/orange lift"; live binding). */
export let SELECTION_COLOR = COLORS.selection;

/** Switch the canvas/WebGL palette in place ('dark' | 'light'); callers redraw. */
export function applyTheme(name) {
  const t = PALETTES[name] ? name : 'dark';
  THEME.name = t;
  Object.assign(COLORS, PALETTES[t]);
  Object.assign(GROUP_COLORS, {
    stars: COLORS.orange, sf: COLORS.sky, chem: COLORS.mustard, struct: COLORS.teal, kin: COLORS.coral,
    gas: COLORS.gas, dust: COLORS.dust, env: COLORS.plum, lines: COLORS.olive, obs: COLORS.cream3, learned: COLORS.cream,
  });
  for (const k of Object.keys(CATEGORY_PALETTES[t])) Object.assign(CATEGORY_COLORS[k], CATEGORY_PALETTES[t][k]);
  NEUTRAL = COLORS.cream;
  SELECTION_COLOR = COLORS.selection;
}

/**
 * Colormap control points (§3.4). All keep L* ≳ 45 so sparse points stay visible on --bg.
 * `redshift` is diverging: red = old / red / quenched (direction set per dim via `reverse`).
 */
export const COLORMAPS = {
  redshift: ['#3e7cc4', '#6fb1d9', '#e9e1c9', '#ee8a4c', '#d8433b'],
  sunset: ['#5a6fd6', '#9a6cc8', '#d8699c', '#f08a5d', '#f6c85f'],
  ember: ['#56708f', '#3aa6a0', '#a7c957', '#e2b23a', '#e8743b'],
};
export const COLORMAP_NAMES = Object.keys(COLORMAPS);

/** Motion (§3.3). */
export const MOTION = {
  ease: [0.65, 0, 0.35, 1],   // cubic-bezier for view changes
  viewMs: 1100,               // default setAxes / preset duration
  fitMs: 600,
  arrivalMs: 2600,            // first-load arrival into SFMS
  uiMs: 200,
  reducedScale: 0.3,          // durations × this under prefers-reduced-motion
  tourRadPerSec: 0.35,        // grand-tour angular speed at speed = 1
};

export const FONTS = {
  display: "'Michroma', 'Eurostile', 'Microgramma', sans-serif",
  ui: "'Jost', 'Futura', 'Century Gothic', sans-serif",
  mono: "'Space Mono', ui-monospace, 'SFMono-Regular', Menlo, monospace",
};

export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const v = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

export function hexToRgb01(hex) {
  return hexToRgb(hex).map((c) => c / 255);
}
