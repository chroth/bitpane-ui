// The screen: a 1-bit display scaled up by a whole number to fill the
// browser window. Everything outside this module works in screen pixels and
// never deals with the scale factor, device pixels, rotation or the iOS
// safe area (the edges hidden by a camera cutout or home bar).

import { corner, cursorURL } from './bitmap.js';
import { el, place } from './dom.js';

let menuHeight = 0;
let root = null;
let probe = null;
let scale = 1;
let size = { w: 0, h: 0 };
let usable = { x: 0, y: 0, w: 0, h: 0 };
const resizeListeners = new Set();

// Creates the screen on first use and returns its root element.
export function screen() {
  if (root) return root;
  root = el('div', '', document.body);
  root.id = 'screen';
  probe = el('div', 'safe-probe', document.body);
  for (const c of ['tl', 'tr', 'bl', 'br']) {
    const k = corner();
    k.classList.add('corner', c);
    root.appendChild(k);
  }
  fit();
  // iOS can report the old size during a rotation, so fit again once it settles.
  let timer;
  const refit = () => {
    fit();
    clearTimeout(timer);
    timer = setTimeout(fit, 300);
  };
  addEventListener('resize', refit);
  addEventListener('orientationchange', refit);
  if (window.visualViewport) visualViewport.addEventListener('resize', refit);
  return root;
}

function fit() {
  // innerHeight may include space behind mobile browser chrome (notably
  // Safari's bottom toolbar). Fit to the viewport users can actually see.
  const viewport = window.visualViewport;
  const width = viewport ? viewport.width : document.documentElement.clientWidth;
  const height = viewport ? viewport.height : document.documentElement.clientHeight;
  scale = Math.max(1, Math.min(Math.floor(width / 640), Math.floor(height / 400)));
  size = { w: Math.floor(width / scale), h: Math.floor(height / scale) };
  root.style.width = size.w + 'px';
  root.style.height = size.h + 'px';
  root.style.transform = scale === 1 ? '' : `scale(${scale})`;
  document.documentElement.style.backgroundSize = `${2 * scale}px ${2 * scale}px`;
  root.style.setProperty('--cursor', `url(${cursorURL(scale)}) ${scale} ${scale}, default`);
  root.style.setProperty('--scale', scale);
  // Read the safe-area insets directly instead of subtracting the probe's
  // viewport coordinates (which refer to the larger layout viewport on iOS).
  const safe = getComputedStyle(probe);
  const left = Math.ceil(parseFloat(safe.left) / scale) || 0;
  const right = Math.ceil(parseFloat(safe.right) / scale) || 0;
  const top = Math.ceil(parseFloat(safe.top) / scale) || 0;
  const bottom = Math.ceil(parseFloat(safe.bottom) / scale) || 0;
  usable = {
    x: left,
    y: top + menuHeight,
    w: Math.max(0, size.w - left - right),
    h: Math.max(0, size.h - top - bottom - menuHeight),
  };
  for (const fn of resizeListeners) fn();
}

// The part of the screen that is actually visible, in screen pixels.
export function area() {
  return usable;
}

// Calls fn whenever area() changes. Returns a function that stops it.
export function onResize(fn) {
  resizeListeners.add(fn);
  return () => resizeListeners.delete(fn);
}

// Pointer position of an event, in screen pixels.
export function pointer(event) {
  return { x: event.clientX / scale, y: event.clientY / scale };
}

// Rectangle of an element, in screen pixels.
export function rectOf(e) {
  const r = e.getBoundingClientRect();
  return {
    x: Math.round(r.left / scale),
    y: Math.round(r.top / scale),
    w: Math.round(r.width / scale),
    h: Math.round(r.height / scale),
  };
}

// Follows a pointer drag that started with `event` until release.
// move(dx, dy, ev) runs once the pointer has moved more than 2 pixels;
// end(dx, dy, moved, ev) runs on release. Deltas are in screen pixels.
export function track(event, { move, end }) {
  const start = pointer(event);
  let moved = false;
  const delta = (ev) => {
    const p = pointer(ev);
    return [Math.round(p.x - start.x), Math.round(p.y - start.y)];
  };
  const onMove = (ev) => {
    const [dx, dy] = delta(ev);
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) moved = true;
    if (moved && move) move(dx, dy, ev);
  };
  const onUp = (ev) => {
    removeEventListener('pointermove', onMove);
    removeEventListener('pointerup', onUp);
    removeEventListener('pointercancel', onUp);
    if (end) end(...delta(ev), moved, ev);
  };
  addEventListener('pointermove', onMove);
  addEventListener('pointerup', onUp);
  addEventListener('pointercancel', onUp);
}

// A 50% gray outline rectangle, as drawn while dragging. Call .set(rect)
// to position it and .remove() when done.
export function outline(parent = root) {
  const g = el('div', 'ghost', parent);
  for (let i = 0; i < 4; i++) el('i', '', g);
  g.set = (r) => place(g, r);
  return g;
}

// Expanding zoom outlines from one rectangle to another. Resolves
// when done; skipped when either end is missing or motion is reduced.
export function zoomRects(from, to) {
  return new Promise((done) => {
    if (!from || !to || matchMedia('(prefers-reduced-motion: reduce)').matches) return done();
    const steps = 12, trail = 4;
    const lerp = (a, b, t) => Math.round(a + (b - a) * t);
    const shown = [];
    let i = 0;
    const frame = () => {
      if (i <= steps) {
        const t = 1 - Math.pow(1 - i / steps, 2);
        const g = outline();
        g.set({ x: lerp(from.x, to.x, t), y: lerp(from.y, to.y, t), w: lerp(from.w, to.w, t), h: lerp(from.h, to.h, t) });
        shown.push(g);
      }
      if (shown.length > trail || i > steps) shown.shift().remove();
      i++;
      if (shown.length) requestAnimationFrame(frame);
      else done();
    };
    frame();
  });
}

// Blanks the screen for a moment, then loads href.
export function restart(href) {
  root.classList.add('black');
  setTimeout(() => location.assign(href), 600);
}


// Internal: reserve space for the optional menu bar, then refit windows/icons.
export function reserveMenu(height) {
  screen();
  menuHeight = height;
  fit();
}
