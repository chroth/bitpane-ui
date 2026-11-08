// The screen: a 1-bit display scaled up by a whole number to fill the
// browser window. Everything outside this module works in screen pixels and
// never deals with the scale factor, device pixels, rotation or the iOS
// safe area (the edges hidden by a camera cutout or home bar).

import { corner, cursorURL } from './bitmap.js';
import { el, place, type Rect } from './dom.js';

let menuHeight = 0;
let root: HTMLDivElement | null = null;
let probe: HTMLDivElement | null = null;
let scale = 1;
let usable: Rect = { x: 0, y: 0, w: 0, h: 0 };
const resizeListeners = new Set<() => void>();

/** The screen element, created on first use. */
export function screen(): HTMLDivElement {
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
  let timer: ReturnType<typeof setTimeout> | undefined;
  const refit = (): void => {
    fit();
    clearTimeout(timer);
    timer = setTimeout(fit, 300);
  };
  addEventListener('resize', refit);
  addEventListener('orientationchange', refit);
  window.visualViewport?.addEventListener('resize', refit);
  return root;
}

function fit(): void {
  if (!root || !probe) return;
  // innerHeight may include space behind mobile browser chrome (notably
  // Safari's bottom toolbar), so fit to the viewport that is actually visible.
  const viewport = window.visualViewport;
  const width = viewport ? viewport.width : document.documentElement.clientWidth;
  const height = viewport ? viewport.height : document.documentElement.clientHeight;
  scale = Math.max(1, Math.min(Math.floor(width / 640), Math.floor(height / 400)));
  const size = { w: Math.floor(width / scale), h: Math.floor(height / scale) };
  root.style.width = size.w + 'px';
  root.style.height = size.h + 'px';
  root.style.transform = scale === 1 ? '' : `scale(${scale})`;
  document.documentElement.style.backgroundSize = `${2 * scale}px ${2 * scale}px`;
  root.style.setProperty('--cursor', `url(${cursorURL(scale)}) ${scale} ${scale}, default`);
  root.style.setProperty('--scale', String(scale));
  // The probe's computed insets are the safe-area values; its viewport
  // coordinates would refer to the larger layout viewport on iOS.
  const safe = getComputedStyle(probe);
  const inset = (v: string): number => Math.ceil(parseFloat(v) / scale) || 0;
  const left = inset(safe.left), right = inset(safe.right), top = inset(safe.top), bottom = inset(safe.bottom);
  usable = {
    x: left,
    y: top + menuHeight,
    w: Math.max(0, size.w - left - right),
    h: Math.max(0, size.h - top - bottom - menuHeight),
  };
  for (const fn of resizeListeners) fn();
}

/** The visible screen area, clear of the menu bar and the safe-area insets. */
export function area(): Rect {
  screen();
  return usable;
}

/** Calls `fn` whenever area() changes. Returns a function that stops it. */
export function onResize(fn: () => void): () => void {
  resizeListeners.add(fn);
  return () => resizeListeners.delete(fn);
}

export function pointer(event: PointerEvent): { x: number; y: number } {
  return { x: event.clientX / scale, y: event.clientY / scale };
}

export function rectOf(e: Element): Rect {
  const r = e.getBoundingClientRect();
  return {
    x: Math.round(r.left / scale),
    y: Math.round(r.top / scale),
    w: Math.round(r.width / scale),
    h: Math.round(r.height / scale),
  };
}

export interface Drag {
  // Runs once the pointer has moved more than 2 pixels.
  move?(dx: number, dy: number, ev: PointerEvent): void;
  end?(dx: number, dy: number, moved: boolean, ev: PointerEvent): void;
}

/** Follows a pointer drag that started with `event` until release. */
export function track(event: PointerEvent, { move, end }: Drag): void {
  const start = pointer(event);
  let moved = false;
  const delta = (ev: PointerEvent): [number, number] => {
    const p = pointer(ev);
    return [Math.round(p.x - start.x), Math.round(p.y - start.y)];
  };
  const onMove = (ev: PointerEvent): void => {
    const [dx, dy] = delta(ev);
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) moved = true;
    if (moved) move?.(dx, dy, ev);
  };
  const onUp = (ev: PointerEvent): void => {
    removeEventListener('pointermove', onMove);
    removeEventListener('pointerup', onUp);
    removeEventListener('pointercancel', onUp);
    end?.(...delta(ev), moved, ev);
  };
  addEventListener('pointermove', onMove);
  addEventListener('pointerup', onUp);
  addEventListener('pointercancel', onUp);
}

export interface Outline {
  set(r: Rect): void;
  remove(): void;
}

/** A 50% gray outline rectangle, as drawn while dragging. */
export function outline(parent: HTMLElement = screen()): Outline {
  const g = el('div', 'ghost', parent);
  for (let i = 0; i < 4; i++) el('i', '', g);
  return { set: (r) => place(g, r), remove: () => g.remove() };
}

/** Expanding outlines from one rectangle to another; skipped when either is missing or motion is reduced. */
export function zoomRects(from: Rect | null | undefined, to: Rect | null | undefined): Promise<void> {
  return new Promise((done) => {
    if (!from || !to || matchMedia('(prefers-reduced-motion: reduce)').matches) return done();
    const steps = 12, trail = 4;
    const lerp = (a: number, b: number, t: number): number => Math.round(a + (b - a) * t);
    const shown: Outline[] = [];
    let i = 0;
    const frame = (): void => {
      if (i <= steps) {
        const t = 1 - Math.pow(1 - i / steps, 2);
        const g = outline();
        g.set({ x: lerp(from.x, to.x, t), y: lerp(from.y, to.y, t), w: lerp(from.w, to.w, t), h: lerp(from.h, to.h, t) });
        shown.push(g);
      }
      if (shown.length > trail || i > steps) shown.shift()?.remove();
      i++;
      if (shown.length) requestAnimationFrame(frame);
      else done();
    };
    frame();
  });
}

// Reserves room for the menu bar at the top of the visible area.
export function reserveMenu(height: number): void {
  screen();
  menuHeight = height;
  fit();
}
