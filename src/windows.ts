// The window manager: windows that can be dragged, resized, zoomed, closed
// and stacked, and that stay inside the visible screen area.

import { arrow, growBox, titleBox, type Direction } from './bitmap.js';
import * as check from './check.js';
import { el, place, bitmapText, nearest, type Rect } from './dom.js';
import { measure } from './font.js';
import { screen, area, onResize, track, outline, zoomRects, type Outline } from './screen.js';

const TITLE_H = 19;
const INFO_H = 19;
const SCROLL = 16; // scroll bar, including its border line
const MIN_W = 120;
const MIN_H = 90;

export type Size = readonly [width: number, height: number];

export interface WindowOptions {
  /** Show an info line under the title bar; see setInfo. */
  info?: boolean;
  /** Screen-reader names for the close and zoom boxes. */
  labels?: { close?: string; zoom?: string };
}

/**
 * Where a window zooms open from and first appears, such as a desktop icon.
 * The window manager knows nothing else about it.
 */
export interface Opener {
  rect(): Rect | null;
  placeWindow(win: DesktopWindow): { x: number; y: number } | null;
  setOpen(open: boolean): void;
}

const windowOf = new WeakMap<Element, DesktopWindow>();
const openWindows: DesktopWindow[] = [];
let topZ = 10;
let cascade = 0;

// The outer size of a window whose content area is `content`.
export function windowSize([w, h]: Size, { info = false }: WindowOptions = {}): Size {
  return [w + SCROLL + 2, h + TITLE_H + (info ? INFO_H : 0) + SCROLL + 2];
}

export function windowAt(e: Element): DesktopWindow | null {
  return nearest(e, '.win', windowOf);
}

interface ScrollBar {
  el: HTMLDivElement;
  thumb: HTMLDivElement;
}

/**
 * A draggable, resizable, zoomable window. Put your own DOM or canvas in `content`.
 * It is a non-modal `<dialog>`: the browser gives it its role, focuses its
 * content when it opens, and returns focus when it closes.
 */
export class DesktopWindow {
  readonly el: HTMLDialogElement;
  readonly content: HTMLDivElement;
  opener: Opener | null = null;
  /** Called after the window opens. */
  onShow: (() => void) | null = null;
  /** Called after the window closes. */
  onHide: (() => void) | null = null;

  #rect: Rect;
  #title: HTMLElement;
  #titleW: number;
  #info: HTMLDivElement | null = null;
  #infoParts: { t: HTMLElement; w: number }[] = [];
  #vs: ScrollBar;
  #hs: ScrollBar;
  #placed = false;
  #zoomed: Rect | null = null;
  #opening: Promise<void> | null = null;
  #wanted = false; // whether the last call was show() rather than hide()

  // The title may be empty, for a window without one.
  constructor(title: string, size: Size, { info = false, labels = {} }: WindowOptions = {}) {
    const [w, h] = size;
    check.pixels(w, 'Window width', 1);
    check.pixels(h, 'Window height', 1);
    screen();
    this.#rect = { x: 0, y: 0, w, h };
    this.el = el('dialog', 'win');
    windowOf.set(this.el, this);
    if (title) this.el.setAttribute('aria-label', title);

    const tb = el('div', 'tb', this.el);
    const close = this.#titleButton(tb, 'close', check.text(labels.close ?? 'Close', 'Close label'), () => this.hide());
    this.#title = bitmapText(title);
    this.#title.classList.add('ttl');
    tb.insertBefore(this.#title, close.nextSibling);
    this.#titleW = measure(title, 'system') + 12;
    this.#titleButton(tb, 'zoom', check.text(labels.zoom ?? 'Zoom', 'Zoom label'), () => this.toggleZoom());

    let top = TITLE_H;
    if (info) {
      this.#info = el('div', 'info', this.el);
      top += INFO_H;
    }
    this.content = el('div', 'content', this.el);
    this.content.style.top = top + 'px';
    // Focused when the window opens, so keys scroll it.
    this.content.tabIndex = -1;
    this.content.autofocus = true;
    this.#vs = this.#scrollBar('vs', 'up', 'down');
    this.#vs.el.style.top = top - 1 + 'px';
    this.#hs = this.#scrollBar('hs', 'left', 'right');
    const grow = el('div', 'grow', this.el);
    grow.appendChild(growBox());

    this.el.addEventListener('pointerdown', () => this.activate());
    // A press on the frame (title bar, scroll bars) puts focus in the content,
    // where keys scroll it, instead of on the page.
    this.el.addEventListener('mousedown', (e) => {
      if (this.content.contains(e.target as Node)) return;
      e.preventDefault();
      this.content.focus({ preventScroll: true });
    });
    tb.addEventListener('pointerdown', (e) => {
      if (e.button === 0 && !(e.target as Element).closest('button')) this.#drag(e);
    });
    grow.addEventListener('pointerdown', (e) => this.#resize(e));
    // Scroll bars follow the content without the page having to ask.
    const update = (): void => this.#updateScroll();
    this.content.addEventListener('scroll', update);
    new ResizeObserver(update).observe(this.content);
    new MutationObserver(update).observe(this.content, { childList: true, subtree: true, attributes: true, characterData: true });
    onResize(() => {
      if (this.#zoomed) this.#rect = this.#zoomRect();
      if (this.el.isConnected) this.#layout();
    });
  }

  /** Position and size in screen pixels. */
  get rect(): Rect {
    return { ...this.#rect };
  }

  /** Moves or resizes the window, keeping it inside the visible area. */
  setRect(changes: Partial<Rect>): void {
    const next = { ...this.#rect };
    for (const key of Object.keys(changes)) {
      if (key !== 'x' && key !== 'y' && key !== 'w' && key !== 'h') throw new TypeError(`setRect takes x, y, w and h, not "${key}"`);
      next[key] = check.pixels(changes[key]!, `Window ${key}`, key === 'w' || key === 'h' ? 1 : undefined);
    }
    this.#rect = next;
    if ('x' in changes || 'y' in changes) this.#placed = true;
    this.#zoomed = null;
    this.#layout();
  }

  /** Up to three strings for the info line: left, centre and right. */
  setInfo(parts: readonly string[]): void {
    if (!this.#info) throw new Error('setInfo needs a window created with info: true');
    this.#info.replaceChildren();
    this.#infoParts = parts.slice(0, 3).map((str) => {
      const t = bitmapText(str, 'small');
      this.#info!.appendChild(t);
      return { t, w: measure(str, 'small') };
    });
    if (this.el.isConnected) this.#layout();
  }

  #layout(): void {
    this.#clamp();
    const r = this.#rect;
    place(this.el, r);
    const inner = r.w - 2;
    this.#title.style.left = Math.max(26, Math.floor((inner - this.#titleW) / 2)) + 'px';
    this.#title.style.maxWidth = Math.max(0, inner - 52) + 'px';
    const [a, b, c] = this.#infoParts;
    if (a) a.t.style.left = '8px';
    if (b) b.t.style.left = Math.floor((inner - b.w) / 2) + 'px';
    if (c) c.t.style.left = inner - 8 - c.w + 'px';
    this.#updateScroll();
  }

  /** Zooms open from the opener, or comes to the front if already open. */
  async show(): Promise<void> {
    this.#wanted = true;
    if (this.el.isConnected) return this.activate();
    this.#opening ??= this.#open().finally(() => { this.#opening = null; });
    return this.#opening;
  }

  /** Closes the window, or stops it opening if it is still zooming open. */
  hide(): void {
    this.#wanted = false;
    const index = openWindows.indexOf(this);
    if (index < 0) return;
    const hadFocus = this.el.contains(document.activeElement);
    openWindows.splice(index, 1);
    this.el.close();
    this.el.remove();
    this.opener?.setOpen(false);
    const next = openWindows.at(-1);
    next?.activate();
    // close() returns focus where it was; if that is gone, to the window in front.
    if (hadFocus && document.activeElement === document.body) next?.content.focus();
    void zoomRects(this.#rect, this.opener?.rect());
    this.onHide?.();
  }

  activate(): void {
    for (const w of openWindows) if (w !== this) w.el.classList.remove('active');
    this.el.classList.add('active');
    if (+this.el.style.zIndex !== topZ) this.el.style.zIndex = String(++topZ);
    const i = openWindows.indexOf(this);
    if (i >= 0) openWindows.push(...openWindows.splice(i, 1));
  }

  toggleZoom(): void {
    if (this.#zoomed) {
      this.#rect = this.#zoomed;
      this.#zoomed = null;
    } else {
      this.#zoomed = { ...this.#rect };
      this.#rect = this.#zoomRect();
    }
    this.#layout();
  }

  // A zoomed window fills the visible area, and keeps filling it as it changes.
  #zoomRect(): Rect {
    const a = area();
    return { x: a.x + 4, y: a.y + 4, w: a.w - 10, h: a.h - 10 };
  }

  /** Runs each time the window is about to open. */
  protected beforeOpen(): void {}

  async #open(): Promise<void> {
    this.beforeOpen();
    if (!this.#placed) this.#placeFirst();
    this.#clamp();
    await zoomRects(this.opener?.rect(), this.#rect);
    if (!this.#wanted) return;
    screen().appendChild(this.el);
    openWindows.push(this);
    this.#layout();
    this.activate();
    // show() also takes focus, even away from a modal alert, so behind one
    // the window opens without it.
    if (document.querySelector(':modal')) this.el.open = true;
    else this.el.show();
    this.opener?.setOpen(true);
    this.onShow?.();
  }

  #placeFirst(): void {
    const p = this.opener?.placeWindow(this);
    if (p) {
      Object.assign(this.#rect, p);
    } else {
      const a = area(), k = cascade++ % 6;
      Object.assign(this.#rect, { x: a.x + 24 + k * 20, y: a.y + 30 + k * 20 });
    }
    this.#placed = true;
  }

  // Whole window inside the visible area, unless the screen is tiny.
  #clamp(): void {
    const a = area(), r = this.#rect;
    r.w = Math.min(Math.max(MIN_W, r.w), Math.max(1, a.w - 8));
    r.h = Math.min(Math.max(MIN_H, r.h), Math.max(1, a.h - 8));
    r.x = Math.max(a.x + 4, Math.min(r.x, a.x + a.w - r.w - 4));
    r.y = Math.max(a.y + 4, Math.min(r.y, a.y + a.h - r.h - 4));
  }

  // Close and zoom boxes: plain buttons that look pressed while :active.
  #titleButton(tb: HTMLElement, kind: 'close' | 'zoom', name: string, action: () => void): HTMLButtonElement {
    const btn = el('button', kind, tb);
    btn.type = 'button';
    btn.setAttribute('aria-label', name);
    btn.append(titleBox(kind, false), titleBox(kind, true));
    btn.addEventListener('click', () => action());
    return btn;
  }

  // The browser's own scroll bars are hidden. These draw the position: arrows
  // scroll a line and the gray track a page, repeating while held, and the
  // thumb drags. The content itself scrolls natively by wheel, touch and keys.
  #scrollBar(cls: 'vs' | 'hs', back: Direction, forward: Direction): ScrollBar {
    const bar = el('div', cls, this.el);
    const trackEl = el('div', 'track', bar);
    const thumb = el('div', 'thumb', bar);
    const vertical = cls === 'vs';
    const c = this.content;
    const scrollBy = (d: number): void => {
      if (vertical) c.scrollTop += d;
      else c.scrollLeft += d;
    };
    const hold = (e: PointerEvent, step: () => void, box?: HTMLElement): void => {
      e.stopPropagation();
      this.activate();
      box?.classList.add('down');
      step();
      const timer = setInterval(step, 80);
      track(e, { end: () => { clearInterval(timer); box?.classList.remove('down'); } });
    };
    for (const [dir, pos, sign] of [[back, 'a1', -1], [forward, 'a2', 1]] as const) {
      const box = el('div', 'arrow ' + pos, bar);
      const dark = arrow(dir, true);
      dark.classList.add('pressed');
      box.append(arrow(dir, false), dark);
      box.addEventListener('pointerdown', (e) => hold(e, () => scrollBy(sign * 16), box));
    }
    // Pages toward the pointer until the thumb reaches it.
    trackEl.addEventListener('pointerdown', (e) => {
      const at = vertical ? e.clientY : e.clientX;
      const r = thumb.getBoundingClientRect();
      const sign = at < (vertical ? r.top : r.left) ? -1 : 1;
      hold(e, () => {
        const t = thumb.getBoundingClientRect();
        const past = sign < 0 ? at >= (vertical ? t.top : t.left) : at <= (vertical ? t.bottom : t.right);
        if (!past) scrollBy(sign * ((vertical ? c.clientHeight : c.clientWidth) - 16));
      });
    });
    thumb.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.activate();
      const start = vertical ? c.scrollTop : c.scrollLeft;
      const range = vertical ? c.scrollHeight - c.clientHeight : c.scrollWidth - c.clientWidth;
      const travel = Math.max(1, (vertical ? bar.clientHeight : bar.clientWidth) - 46);
      track(e, {
        move: (dx, dy) => {
          const v = start + ((vertical ? dy : dx) * range) / travel;
          if (vertical) c.scrollTop = v;
          else c.scrollLeft = v;
        },
      });
    });
    return { el: bar, thumb };
  }

  #updateScroll(): void {
    const c = this.content;
    const sv = c.scrollHeight > c.clientHeight + 1;
    const sh = c.scrollWidth > c.clientWidth + 1;
    this.el.classList.toggle('sv', sv);
    this.el.classList.toggle('sh', sh);
    if (sv) {
      const t = c.scrollTop / (c.scrollHeight - c.clientHeight);
      this.#vs.thumb.style.top = 15 + Math.round((this.#vs.el.clientHeight - 46) * t) + 'px';
    }
    if (sh) {
      const t = c.scrollLeft / (c.scrollWidth - c.clientWidth);
      this.#hs.thumb.style.left = 15 + Math.round((this.#hs.el.clientWidth - 46) * t) + 'px';
    }
  }

  #drag(e: PointerEvent): void {
    let ghost: Outline | null = null;
    track(e, {
      move: (dx, dy) => {
        ghost ??= outline();
        const r = this.#rect;
        ghost.set({ x: r.x + dx, y: r.y + dy, w: r.w + 1, h: r.h + 1 });
      },
      end: (dx, dy, moved) => {
        ghost?.remove();
        if (!moved) return;
        this.#rect.x += dx;
        this.#rect.y += dy;
        this.#layout();
      },
    });
  }

  #resize(e: PointerEvent): void {
    e.stopPropagation();
    this.activate();
    const r = this.#rect, a = area();
    const sized = (dx: number, dy: number): Rect => ({
      x: r.x,
      y: r.y,
      w: Math.max(MIN_W, Math.min(r.w + dx, a.x + a.w - r.x)),
      h: Math.max(MIN_H, Math.min(r.h + dy, a.y + a.h - r.y)),
    });
    const ghost = outline();
    ghost.set(r);
    track(e, {
      move: (dx, dy) => ghost.set(sized(dx, dy)),
      end: (dx, dy, moved) => {
        ghost.remove();
        if (!moved) return;
        this.#rect = sized(dx, dy);
        this.#zoomed = null;
        this.#layout();
      },
    });
  }
}
