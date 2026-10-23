// Light / dark theme. `<html data-theme="light">` switches the CSS tokens (css/tokens.css);
// applyTheme() swaps the canvas/WebGL palette (config/style.js). The choice is kept in
// localStorage; index.html applies it before first paint.

import { applyTheme } from '../config/style.js';

const KEY = 'gm-theme';
const META = { dark: '#0b0e13', light: '#f3eee3' };

export function getTheme() {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

/** Apply a theme ('dark' | 'light'); emits 'theme' {theme} and redraws when `app` is given. */
export function setTheme(name, app, { save = true } = {}) {
  const t = name === 'light' ? 'light' : 'dark';
  const root = document.documentElement;
  if (t === 'light') root.dataset.theme = 'light';
  else delete root.dataset.theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', META[t]);
  document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', t);
  applyTheme(t);
  if (save) {
    try {
      localStorage.setItem(KEY, t);
    } catch (e) { /* storage blocked: the choice lasts this page only */ }
  }
  if (app) {
    app.events.emit('theme', { theme: t });
    app.overlays?.redraw();
    app.requestRender?.();
  }
  return t;
}

/** Sync the JS palette with the theme index.html already set on <html>. */
export function initTheme(app) {
  return setTheme(getTheme(), app, { save: false });
}
