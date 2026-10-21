// Small anchored panel shared by the observation chips and additional views.
import { floatLayer, clamp, isNarrow } from './dom.js';
import { hideTip } from './tooltip.js';

export function createPopover(anchor, panel, { side = 'bottom' } = {}) {
  panel.hidden = true;
  floatLayer().append(panel);
  anchor.setAttribute('aria-controls', panel.id);
  anchor.setAttribute('aria-expanded', 'false');
  function place() {
    if (panel.hidden) return;
    const r = anchor.getBoundingClientRect(), m = 10, gap = 9;
    panel.style.maxHeight = `${window.innerHeight - 2 * m}px`;
    const w = panel.offsetWidth, ht = panel.offsetHeight;
    const right = side === 'right' && !isNarrow();
    const x = right ? r.right + gap : r.right - w;
    const y = right ? r.top : r.bottom + gap;
    panel.style.left = `${clamp(x, m, Math.max(m, window.innerWidth - w - m))}px`;
    panel.style.top = `${clamp(y, m, Math.max(m, window.innerHeight - ht - m))}px`;
  }
  function close(focus = false) {
    if (panel.hidden) return false;
    panel.hidden = true;
    anchor.setAttribute('aria-expanded', 'false');
    if (focus) anchor.focus({ preventScroll: true });
    return true;
  }
  function show() {
    hideTip(true);
    panel.hidden = false;
    anchor.setAttribute('aria-expanded', 'true');
    place();
    panel.querySelector('button:not(:disabled), input:not(:disabled)')?.focus({ preventScroll: true });
  }
  document.addEventListener('pointerdown', e => {
    if (!panel.contains(e.target) && !anchor.contains(e.target)) close();
  });
  document.addEventListener('keydown', e => {
    if (!panel.hidden && e.key === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      close(true);
    }
  }, true);
  panel.addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;
    const controls = [...panel.querySelectorAll('button:not(:disabled), input:not(:disabled)')];
    if ((e.shiftKey && e.target === controls[0]) || (!e.shiftKey && e.target === controls.at(-1))) {
      e.preventDefault();
      close(true);
    }
  });
  window.addEventListener('resize', place);
  document.addEventListener('scroll', e => { if (!panel.contains(e.target)) place(); }, true);
  return { show, close, place, get open() { return !panel.hidden; } };
}
