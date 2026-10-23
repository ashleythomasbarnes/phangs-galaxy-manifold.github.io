// UI entry (DESIGN.md §13): builds the top bar, observation rail, console, inspector, hover card,
// about overlay, splash, URL state and keyboard shortcuts around the core `app`.
// Runs before the columns load (see js/API.md): everything here works from the manifest and
// the store; column-dependent parts wait for 'data:ready'.

import { floatLayer, edgeFades } from './dom.js';
import { initTooltips } from './tooltip.js';
import { initSplash } from './splash.js';
import { createDnd } from './dnd.js';
import { initHeader } from './header.js?v=2';
import { initPhangsTable } from './phangs-table.js';
import { initRail } from './rail.js?v=2';
import { initConsole } from './console.js';
import { initInspector } from './inspector.js?v=2';
import { initHover } from './hover.js?v=2';
import { initAbout } from './about.js';
import { initPhangsInfo } from './phangs-info.js';
import { initKeys } from './keys.js';
import { initUrlState } from './urlstate.js?v=2';
import { closeRadial, radialOpen } from './radial.js';
import { closeColorPopover, colorPopoverOpen } from './colorpop.js';
import { initTheme } from './theme.js';

export async function initUI(app) {
  const $ = (id) => document.getElementById(id);
  const ui = { app, literature: [], litConventions: '' };
  initTheme(app);
  floatLayer();
  initTooltips();
  ui.splash = initSplash(app);

  // literature list (cartridge cards, about); non-blocking
  fetch(`${app.data.base}/literature.json`)
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      if (!j) return;
      ui.literature = Array.isArray(j.relations) ? j.relations : [];
      ui.litConventions = j.conventions || '';
      ui.about?.rebuild();
    })
    .catch(() => {});

  ui.closeMenus = () => {
    let closed = false;
    if (radialOpen()) {
      closeRadial();
      closed = true;
    }
    if (colorPopoverOpen()) {
      closeColorPopover();
      closed = true;
    }
    closed = ui.table?.closePanel() || closed;
    closed = ui.rail?.close() || closed;
    closed = ui.header?.presets.close() || closed;
    closed = ui.header?.search.close() || closed;
    return closed;
  };

  const step = (name, fn) => {
    try {
      return fn();
    } catch (e) {
      console.error(`UI: ${name} failed`, e);
      return null;
    }
  };

  ui.dnd = step('dnd', () => createDnd(app, ui));
  ui.header = step('header', () => initHeader(app, $('topbar'), ui));
  ui.table = step('PHANGS table', () => initPhangsTable(app, ui));
  ui.rail = step('rail', () => initRail(app, $('rail'), ui));
  ui.console = step('console', () => initConsole(app, $('console'), ui));
  ui.inspector = step('inspector', () => initInspector(app, $('inspector'), ui));
  ui.hover = step('hover', () => initHover(app, app.layers.stageUI, ui));
  ui.about = step('about', () => initAbout(app, ui));
  ui.phangsInfo = step('PHANGS information', () => initPhangsInfo(app, ui));
  ui.keys = step('keys', () => initKeys(app, ui));
  ui.url = step('url', () => initUrlState(app, ui));

  const relayout = () => ui.dnd?.layoutStrips();
  app.events.on('resize', relayout);
  relayout();

  // soft edge fades where a strip scrolls (phone console and rail, cartridge tray, short rail)
  edgeFades($('console'), 'x');
  edgeFades($('rail'), 'auto');
  edgeFades(document.querySelector('#topbar .carts-tray'), 'x');

  document.documentElement.classList.add('ui-ready');
  // handle for tests and the console
  window.gm = ui;
  return ui;
}
