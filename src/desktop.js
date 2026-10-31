// The desktop: icons on the desktop and in folder windows, and the windows
// they open. A page only describes what exists, for example:
//
//   const desktop = new Desktop();
//   const about = desktop.textWindow('About', ['Hello', { text: 'GitHub', href }]);
//   const hd = desktop.folderWindow('HD', [{ label: 'About', kind: 'document', opens: about }]);
//   desktop.disk('HD', hd);
//   desktop.trash([]);
//
// Everything else lives here: where icons and windows go, selecting and
// double-clicking, dragging icons between folders, the desktop and the
// Trash, the item counts in each window's info bar, the Trash looking full
// when it holds something, and keeping it all on screen when the browser
// window changes size.

import { icon, arrow, growBox, titleBox } from './bitmap.js';
import { measure } from './font.js';
import { el, place, bitmapText, isOver } from './dom.js';
import { screen, area, onResize, pointer, rectOf, track, outline, zoomRects } from './screen.js';

const TITLE_H = 19;
const INFO_H = 19;
const MIN_W = 120;
const MIN_H = 90;
// Size of an item on disk in K when it doesn't give its own `kb`. Folders,
// the disk and the Trash add up whatever they contain.
const DEFAULT_K = { document: 1, picture: 4 };
// A 20 MB hard disk, unless disk() is given another capacity in K.
let diskCapacity = 20480;

let desktopFolder = null;
let selected = null;
let lastClick = { icon: null, time: 0 };
let topZ = 10;
let windowCount = 0;
const openWindows = [];

onResize(() => {
  for (const w of openWindows) {
    w.clamp();
    w.layout();
  }
});

function select(ic) {
  if (selected && selected !== ic) selected.el.classList.remove('selected');
  selected = ic;
  if (ic) ic.el.classList.add('selected');
}

function isDoubleClick(ic) {
  const now = Date.now();
  const dbl = lastClick.icon === ic && now - lastClick.time < 500;
  lastClick = dbl ? { icon: null, time: 0 } : { icon: ic, time: now };
  return dbl;
}

function clampTo(b, x, y) {
  return { x: Math.max(b.x0, Math.min(b.x1, x)), y: Math.max(b.y0, Math.min(b.y1, y)) };
}

// --- Folders: the desktop and the inside of folder windows ---

class Folder {
  // content: the element icons live in. owner: the FolderWindow showing this
  // folder, or null for the desktop. slots() lists free-placement spots in
  // order of preference; bounds() limits where icons may be dropped.
  constructor(content, { owner = null, slots, bounds }) {
    this.content = content;
    this.owner = owner;
    this.slots = slots;
    this.bounds = bounds;
    this.items = [];
  }

  // Moves an icon here, to `at` or else the first free slot.
  add(ic, at) {
    const old = ic.folder;
    if (old) old.items.splice(old.items.indexOf(ic), 1);
    ic.folder = this;
    this.items.push(ic);
    this.content.appendChild(ic.el);
    if (!at) {
      const free = this.slots().find(([x, y]) =>
        !this.items.some((o) => o !== ic && Math.abs(o.x - x) < 64 && Math.abs(o.y - y) < 48));
      const [x, y] = free || this.slots()[0];
      at = { x, y };
    }
    const p = clampTo(this.bounds(), at.x, at.y);
    ic.moveTo(p.x, p.y);
    if (old && old !== this && old.owner) old.owner.changed();
    if (this.owner) this.owner.changed();
  }

  kb() {
    return this.items.reduce((sum, ic) => sum + ic.kb(), 0);
  }
}

// True if `win` is the window `ic` opens, or is somewhere inside it.
function isInside(win, ic) {
  for (let w = win; w; w = w.opener && w.opener.folder.owner) if (w === ic.opens) return true;
  return false;
}

// --- Icons ---

class Icon {
  // opens: the Window a double-click opens. Icons that open a folder window
  // are also drop targets. corner: 'top' or 'bottom' parks the icon at that
  // end of the desktop's right edge until it's dragged elsewhere; such icons
  // (the disk and the Trash) can never leave the desktop. kb: the item's
  // own size on disk in K.
  constructor(folder, { label, kind, opens, corner, kb }) {
    this.label = label;
    this.opens = opens;
    this.ownKb = kb ?? DEFAULT_K[kind] ?? 0;
    this.corner = corner;
    this.pinned = !!corner;
    if (opens) opens.opener = this;
    this.el = el('div', 'icon');
    this.el._icon = this;
    this.el.tabIndex = 0;
    this.el.setAttribute('role', 'button');
    this.el.setAttribute('aria-label', label);
    this.img = el('div', 'img', this.el);
    this.setKind(kind);
    const lbl = bitmapText(label, 'small');
    lbl.classList.add('lbl');
    lbl.setAttribute('aria-hidden', 'true');
    this.el.appendChild(lbl);
    this.labelW = measure(label, 'small') + 2;
    lbl.style.left = Math.floor((32 - this.labelW) / 2) + 'px';
    this.el.addEventListener('pointerdown', (e) => this.down(e));
    this.el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        select(this);
        this.open();
      }
    });
    folder.add(this);
  }

  setKind(kind) {
    this.kind = kind;
    const art = icon(kind);
    art.opened.classList.add('opened');
    art.selected.classList.add('sel');
    this.img.replaceChildren(art.normal, art.opened, art.selected);
  }

  moveTo(x, y) {
    this.x = x;
    this.y = y;
    place(this.el, { x, y });
  }

  kb() {
    return this.ownKb + (this.opens && this.opens.folder ? this.opens.folder.kb() : 0);
  }

  open() {
    if (this.opens) this.opens.show();
  }

  setOpen(open) {
    this.el.classList.toggle('open', open);
  }

  // Where a drop at this pointer event would land: { folder, icon? }, or
  // null if the icon can't go there and should stay put.
  dropTarget(ev) {
    for (const e of document.elementsFromPoint(ev.clientX, ev.clientY)) {
      if (this.el.contains(e)) continue;
      const hit = e.closest('.icon');
      if (hit && hit._icon.opens && hit._icon.opens.folder) {
        const t = hit._icon;
        return this.pinned || isInside(t.opens, this) ? null : { folder: t.opens.folder, icon: t };
      }
      const win = e.closest('.win');
      if (win) {
        const w = win._win;
        return !w.folder || this.pinned || isInside(w, this) ? null : { folder: w.folder };
      }
      if (e === desktopFolder.content) return { folder: desktopFolder };
    }
    return null;
  }

  // Click selects, double-click opens, dragging shows a gray outline that
  // moves the icon wherever it is dropped.
  down(e) {
    if (e.button > 0) return;
    e.stopPropagation();
    if (this.folder.owner) this.folder.owner.activate();
    select(this);
    const start = rectOf(this.img);
    const p0 = pointer(e);
    const grab = { x: p0.x - start.x, y: p0.y - start.y };
    let ghost = null, hover = null;
    const setHover = (ic) => {
      if (hover === ic) return;
      if (hover) hover.el.classList.remove('hover');
      hover = ic;
      if (hover) hover.el.classList.add('hover');
    };
    track(e, {
      move: (dx, dy, ev) => {
        if (!ghost) {
          ghost = el('div', 'ghost', screen());
          ghost.appendChild(icon(this.kind).outline);
          outline(ghost).set({ x: Math.floor((32 - this.labelW) / 2), y: 34, w: this.labelW, h: 12 });
        }
        place(ghost, { x: start.x + dx, y: start.y + dy, w: 32, h: 32 });
        const t = this.dropTarget(ev);
        setHover(t && t.icon || null);
      },
      end: (dx, dy, moved, ev) => {
        if (ghost) ghost.remove();
        setHover(null);
        if (!moved) {
          if (isDoubleClick(this)) this.open();
          return;
        }
        const t = this.dropTarget(ev);
        if (!t) return;
        if (t.icon) return t.folder.add(this);
        const p = pointer(ev);
        const c = t.folder.content;
        const origin = t.folder === desktopFolder ? { x: 0, y: 0 } : rectOf(c);
        this.corner = null;
        t.folder.add(this, {
          x: Math.round(p.x - grab.x - origin.x + c.scrollLeft),
          y: Math.round(p.y - grab.y - origin.y + c.scrollTop),
        });
      },
    });
  }
}

// --- Windows ---

export class DesktopWindow {
  // size: [w, h] in screen pixels. The first time a window opens it is placed
  // near the icon that opened it; after that it stays where the user left it.
  constructor(title, [w, h], { info = false } = {}) {
    screen();
    this.rect = { x: 0, y: 0, w, h };
    this.placed = false;
    this.opener = null;
    this.zoomed = null;
    this.el = el('div', 'win');
    this.el._win = this;
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-label', title);

    const tb = el('div', 'tb', this.el);
    const close = this.titleButton(tb, 'close', 'Close', () => this.hide());
    this.ttl = bitmapText(title);
    this.ttl.classList.add('ttl');
    tb.insertBefore(this.ttl, close.nextSibling);
    this.titleW = measure(title, 'system') + 12;
    this.titleButton(tb, 'zoom', 'Zoom', () => this.toggleZoom());

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

    this.el.addEventListener('pointerdown', (e) => {
      this.activate();
      if (e.target === this.content) select(null);
    });
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

  setInfo(parts) {
    this.info.replaceChildren();
    this.infoParts = parts.map((str) => {
      const t = bitmapText(str, 'small');
      this.info.appendChild(t);
      return { t, w: measure(str, 'small') };
    });
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

  // Zooms open from the icon that opens it, or comes to the front if open.
  async show() {
    if (this.el.isConnected) return this.activate();
    if (this.opening) return this.opening;
    this.opening = this.open();
    try { await this.opening; } finally { this.opening = null; }
  }

  async open() {
    if (!this.placed) this.placeNearOpener();
    this.clamp();
    const from = this.opener;
    await zoomRects(from && rectOf(from.img), this.rect);
    screen().appendChild(this.el);
    openWindows.push(this);
    this.layout();
    this.activate();
    if (from) from.setOpen(true);
  }

  hide() {
    const index = openWindows.indexOf(this);
    if (index < 0) return;
    openWindows.splice(index, 1);
    this.el.remove();
    const from = this.opener;
    if (from) from.setOpen(false);
    const next = openWindows[openWindows.length - 1];
    if (next) next.activate();
    zoomRects(this.rect, from && from.el.isConnected && rectOf(from.img));
  }

  // Desktop icons sit at the right edge, so their windows open to the left
  // of them; windows opened from inside a folder open just below it.
  placeNearOpener() {
    const a = area(), r = this.rect, from = this.opener;
    const parent = from && from.folder.owner;
    if (parent) {
      r.x = parent.rect.x + 30;
      r.y = parent.rect.y + 30;
    } else if (from) {
      r.x = from.x - r.w - 24;
      r.y = Math.min(from.y, a.y + a.h - r.h - 8);
    } else {
      const k = windowCount++ % 6;
      r.x = a.x + 24 + k * 20;
      r.y = a.y + 30 + k * 20;
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

  // Keeps the window on screen and at least its title bar reachable.
  clamp() {
    const a = area(), r = this.rect;
    // Fit the entire window into the usable viewport whenever possible.
    // Only allow a partial window on unusually tiny viewports.
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

class FolderWindow extends DesktopWindow {
  constructor(title, size) {
    super(title, size, { info: true });
    this.folder = new Folder(this.content, {
      owner: this,
      slots: () => {
        const out = [];
        for (let row = 0; row < 20; row++) for (let col = 0; col < 4; col++) out.push([30 + col * 90, 16 + row * 60]);
        return out;
      },
      bounds: () => ({ x0: 4, y0: 4, x1: this.content.clientWidth + 400, y1: this.content.clientHeight + 400 }),
    });
    this.onChange = null;
  }

  async show() {
    this.updateInfo();
    await super.show();
  }

  // Called by the folder whenever its contents change.
  changed() {
    if (this.el.isConnected) {
      this.updateInfo();
      this.layout();
    }
    if (this.onChange) this.onChange();
  }

  // This window's item count, then totals for the
  // whole disk. Everything on the desktop, the Trash included, is on the disk.
  updateInfo() {
    const n = this.folder.items.length;
    const used = desktopFolder.kb();
    const k = (v) => Math.max(0, v).toLocaleString('en-US') + 'K';
    this.setInfo([
      n + (n === 1 ? ' item' : ' items'),
      k(used) + ' in disk',
      k(diskCapacity - used) + ' available',
    ]);
  }
}

// --- The desktop ---

export class Desktop {
  constructor() {
    if (desktopFolder) throw new Error('Only one Desktop can exist per page.');
    const root = screen();
    desktopFolder = new Folder(root, {
      slots: () => {
        const a = area(), out = [];
        for (let x = a.x + a.w - 56; x > a.x; x -= 72) for (let y = a.y + 10; y < a.y + a.h - 50; y += 56) out.push([x, y]);
        return out;
      },
      bounds: () => {
        const a = area();
        return { x0: a.x + 4, y0: a.y + 4, x1: a.x + a.w - 36, y1: a.y + a.h - 50 };
      },
    });
    root.addEventListener('pointerdown', (e) => {
      if (e.target === root) select(null);
    });
    onResize(() => {
      arrangeDesktop();
    });
  }

  // A plain text document. lines: strings, or { text, href } links.
  textWindow(title, lines) {
    const widest = Math.max(...lines.map((l) => measure(typeof l === 'string' ? l : l.text, 'system')));
    const win = new DesktopWindow(title, [Math.max(260, widest + 70), lines.length * 16 + 85]);
    const doc = el('div', 'doc', win.content);
    for (const line of lines) {
      const row = el('div', 'line', doc);
      if (typeof line === 'string') {
        if (line) row.appendChild(bitmapText(line));
        continue;
      }
      const a = bitmapText(line.text, 'system', 'a');
      a.href = line.href;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      row.appendChild(a);
    }
    return win;
  }

  // A picture document, sized to fit its 1-bit image. The image is only
  // downloaded the first time the window opens.
  pictureWindow(title, { src, width, height, alt }) {
    const win = new DesktopWindow(title, [width + 18, height + TITLE_H + 18]);
    const img = el('img', 'px', win.content);
    img.width = width;
    img.height = height;
    img.alt = alt;
    img.draggable = false;
    const show = win.show;
    win.show = function () {
      if (!img.src) img.src = src;
      return show.call(this);
    };
    return win;
  }

  // A folder window holding icons: [{ label, kind, opens }].
  folderWindow(title, items, size = [320, 160]) {
    const win = new FolderWindow(title, size);
    for (const item of items) new Icon(win.folder, item);
    return win;
  }

  // The disk icon, in the top right corner of the desktop. capacity: the
  // disk's size in K, which the windows' "K available" counts down from.
  disk(label, win, { capacity } = {}) {
    if (capacity) diskCapacity = capacity;
    new Icon(desktopFolder, { label, kind: 'hd', opens: win, corner: 'top' });
    arrangeDesktop();
  }

  // The Trash, in the bottom right corner, holding `items` to begin with.
  trash(items) {
    const win = this.folderWindow('Trash', items, [240, 130]);
    const ic = new Icon(desktopFolder, { label: 'Trash', kind: 'trash', opens: win, corner: 'bottom' });
    win.onChange = () => ic.setKind(win.folder.items.length ? 'trashFull' : 'trash');
    win.onChange();
    arrangeDesktop();
  }
}

// Parks corner icons and pulls the rest back on screen.
function arrangeDesktop() {
  const a = area(), b = desktopFolder.bounds();
  for (const ic of desktopFolder.items) {
    if (ic.corner === 'top') ic.moveTo(a.x + a.w - 56, a.y + 10);
    else if (ic.corner === 'bottom') ic.moveTo(a.x + a.w - 56, a.y + a.h - 58);
    else {
      const p = clampTo(b, ic.x, ic.y);
      ic.moveTo(p.x, p.y);
    }
  }
}

