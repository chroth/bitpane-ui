// The window manager: windows that can be dragged, resized, zoomed, closed
// and stacked, and that stay inside the visible screen area.
//
// A window can have an `opener`: any object with rect() (the rectangle the
// window zooms open from and back to, or null), placeWindow(win) (where it
// should first appear, or null) and setOpen(open) (told when it opens and
// closes). Desktop icons are openers; the window manager knows nothing else
// about them.

import { arrow, growBox, titleBox } from './bitmap.js';
import { measure } from './font.js';
import { el, place, bitmapText, isOver, nearest } from './dom.js';
import { screen, area, onResize, track, outline, zoomRects } from './screen.js';

export const TITLE_H = 19;
const INFO_H = 19;
const MIN_W = 120;
const MIN_H = 90;

const windowOf = new WeakMap();
const openWindows = [];
let topZ = 10;
let cascade = 0;

onResize(() => {
  for (const w of openWindows) {
    w.clamp();
    w.layout();
  }
});

// The window an element belongs to, or null.
export function windowAt(e) {
  return nearest(e, '.win', windowOf);
}

export class DesktopWindow {
  // size: [w, h] in screen pixels. info: show an info line under the title
  // bar (see setInfo). labels: names screen readers use for the close and
  // zoom boxes. The first time a window opens it goes where its opener
  // suggests, or else cascades from the top left; after that it stays where
  // the user left it.
  constructor(title, [w, h], { info = false, labels = {} } = {}) {
    screen();
    this.rect = { x: 0, y: 0, w, h };
    this.placed = false;
    this.opener = null;
    this.zoomed = null;
    this.el = el('div', 'win');
    windowOf.set(this.el, this);
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-label', title);

    const tb = el('div', 'tb', this.el);
    const close = this.titleButton(tb, 'close', labels.close ?? 'Close', () => this.hide());
    this.ttl = bitmapText(title);
    this.ttl.classList.add('ttl');
    tb.insertBefore(this.ttl, close.nextSibling);
    this.titleW = measure(title, 'system') + 12;
    this.titleButton(tb, 'zoom', labels.zoom ?? 'Zoom', () => this.toggleZoom());

    let top = TITLE_H;
    if (info) {
      this.info = el('div', 'info', this.el);
      this.infoParts = [];
      top += INFO_H;
    }
    this.content = el('div', 'content', this.el);
    this.content.style.top = top + 'px';
    this.vs = el('div', 'vs', this.el);
    this.vs.style.top = top - 1 + 'px';
    this.hs = el('div', 'hs', this.el);
    const grow = el('div', 'grow', this.el);
    grow.appendChild(growBox());
    this.scrollBar(this.vs, 'up', 'down');
    this.scrollBar(this.hs, 'left', 'right');

    this.el.addEventListener('pointerdown', () => this.activate());
    tb.addEventListener('pointerdown', (e) => {
      if (e.button === 0 && !e.target.closest('button')) this.drag(e);
    });
    grow.addEventListener('pointerdown', (e) => this.resize(e));
    this.content.addEventListener('scroll', () => this.updateScroll());
  }

  // Close and zoom boxes: highlighted while pressed, fire on release inside.
  titleButton(tb, kind, name, action) {
    const btn = el('button', kind, tb);
    btn.setAttribute('aria-label', name);
    btn.append(titleBox(kind, false), titleBox(kind, true));
    btn.addEventListener('pointerdown', (e) => {
      if (e.button > 0) return;
      e.stopPropagation();
      this.activate();
      btn.classList.add('down');
      track(e, {
        end: (dx, dy, moved, ev) => {
          btn.classList.remove('down');
          if (isOver(btn, ev)) action();
        },
      });
    });
    btn.addEventListener('click', (e) => {
      if (e.detail === 0) action();
    });
    return btn;
  }

  scrollBar(bar, back, forward) {
    const vertical = back === 'up';
    el('div', 'track', bar);
    bar.thumb = el('div', 'thumb', bar);
    for (const [dir, cls, sign] of [[back, 'a1', -1], [forward, 'a2', 1]]) {
      const box = el('div', 'arrow ' + cls, bar);
      const dark = arrow(dir, true);
      dark.classList.add('pressed');
      box.append(arrow(dir, false), dark);
      box.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        this.activate();
        box.classList.add('down');
        const step = () => {
          if (vertical) this.content.scrollTop += sign * 16;
          else this.content.scrollLeft += sign * 16;
        };
        step();
        const timer = setInterval(step, 80);
        track(e, { end: () => { clearInterval(timer); box.classList.remove('down'); } });
      });
    }
  }

  // Up to three strings for the info line: left, centre and right.
  setInfo(parts) {
    this.info.replaceChildren();
    this.infoParts = parts.map((str) => {
      const t = bitmapText(str, 'small');
      this.info.appendChild(t);
      return { t, w: measure(str, 'small') };
    });
    if (this.el.isConnected) this.layout();
  }

  layout() {
    const r = this.rect;
    place(this.el, r);
    const inner = r.w - 2;
    this.ttl.style.left = Math.max(26, Math.floor((inner - this.titleW) / 2)) + 'px';
    this.ttl.style.maxWidth = Math.max(0, inner - 52) + 'px';
    if (this.info) {
      const [a, b, c] = this.infoParts;
      if (a) a.t.style.left = '8px';
      if (b) b.t.style.left = Math.floor((inner - b.w) / 2) + 'px';
      if (c) c.t.style.left = inner - 8 - c.w + 'px';
    }
    this.updateScroll();
  }

  updateScroll() {
    const c = this.content;
    const sv = c.scrollHeight > c.clientHeight + 1;
    const sh = c.scrollWidth > c.clientWidth + 1;
    this.el.classList.toggle('sv', sv);
    this.el.classList.toggle('sh', sh);
    if (sv) {
      const t = c.scrollTop / (c.scrollHeight - c.clientHeight);
      this.vs.thumb.style.top = 15 + Math.round((this.vs.clientHeight - 46) * t) + 'px';
    }
    if (sh) {
      const t = c.scrollLeft / (c.scrollWidth - c.clientWidth);
      this.hs.thumb.style.left = 15 + Math.round((this.hs.clientWidth - 46) * t) + 'px';
    }
  }

  // Zooms open from the opener, or comes to the front if already open.
  async show() {
    if (this.el.isConnected) return this.activate();
    if (this.opening) return this.opening;
    this.opening = this.open();
    try { await this.opening; } finally { this.opening = null; }
  }

  async open() {
    if (!this.placed) this.placeFirst();
    this.clamp();
    await zoomRects(this.opener?.rect(), this.rect);
    screen().appendChild(this.el);
    openWindows.push(this);
    this.layout();
    this.activate();
    this.opener?.setOpen(true);
  }

  hide() {
    const index = openWindows.indexOf(this);
    if (index < 0) return;
    openWindows.splice(index, 1);
    this.el.remove();
    this.opener?.setOpen(false);
    const next = openWindows[openWindows.length - 1];
    if (next) next.activate();
    zoomRects(this.rect, this.opener?.rect());
  }

  placeFirst() {
    const p = this.opener?.placeWindow(this);
    if (p) {
      Object.assign(this.rect, p);
    } else {
      const a = area(), k = cascade++ % 6;
      Object.assign(this.rect, { x: a.x + 24 + k * 20, y: a.y + 30 + k * 20 });
    }
    this.placed = true;
  }

  activate() {
    for (const w of openWindows) if (w !== this) w.el.classList.remove('active');
    this.el.classList.add('active');
    if (+this.el.style.zIndex !== topZ) this.el.style.zIndex = ++topZ;
    const i = openWindows.indexOf(this);
    if (i >= 0) openWindows.push(...openWindows.splice(i, 1));
  }

  // Keeps the window inside the visible area: whole, unless the screen is tiny.
  clamp() {
    const a = area(), r = this.rect;
    r.w = Math.min(Math.max(MIN_W, r.w), Math.max(1, a.w - 8));
    r.h = Math.min(Math.max(MIN_H, r.h), Math.max(1, a.h - 8));
    r.x = Math.max(a.x + 4, Math.min(r.x, a.x + a.w - r.w - 4));
    r.y = Math.max(a.y + 4, Math.min(r.y, a.y + a.h - r.h - 4));
  }

  drag(e) {
    let ghost = null;
    track(e, {
      move: (dx, dy) => {
        ghost = ghost || outline();
        ghost.set({ x: this.rect.x + dx, y: this.rect.y + dy, w: this.rect.w + 1, h: this.rect.h + 1 });
      },
      end: (dx, dy, moved) => {
        if (ghost) ghost.remove();
        if (!moved) return;
        this.rect.x += dx;
        this.rect.y += dy;
        this.clamp();
        this.layout();
      },
    });
  }

  resize(e) {
    e.stopPropagation();
    this.activate();
    const r = this.rect, a = area();
    const sized = (dx, dy) => ({
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
        this.rect = sized(dx, dy);
        this.zoomed = null;
        this.layout();
      },
    });
  }

  toggleZoom() {
    if (this.zoomed) {
      this.rect = this.zoomed;
      this.zoomed = null;
    } else {
      const a = area();
      this.zoomed = Object.assign({}, this.rect);
      this.rect = { x: a.x + 4, y: a.y + 4, w: a.w - 10, h: a.h - 10 };
    }
    this.layout();
  }
}
