// The Finder: icons on the desktop and in folder windows. A page only
// describes what exists, for example:
//
//   const desktop = new Desktop();
//   const about = textWindow('About', ['Hello', { text: 'GitHub', href }]);
//   const hd = desktop.folderWindow('HD', [{ label: 'About', kind: 'document', opens: about }]);
//   desktop.disk('HD', hd);
//   desktop.trash([]);
//
// The Finder handles selecting and double-clicking icons, dragging them
// between folders, the desktop and the Trash, where their windows open,
// the item counts and disk space in folder windows, the Trash looking full
// when it holds something, and keeping icons on screen.

import { icon } from './bitmap.js';
import { measure } from './font.js';
import { el, place, bitmapText, nearest } from './dom.js';
import { screen, area, onResize, pointer, rectOf, track, outline } from './screen.js';
import { DesktopWindow, windowAt } from './windows.js';

// The kinds of icon a folder can hold; the disk and Trash icons are the
// Finder's own.
const ITEM_KINDS = ['document', 'picture', 'folder'];
// Size of an item on disk in K when it doesn't give its own `kb`. Folders,
// the disk and the Trash add up whatever they contain.
const DEFAULT_K = { document: 1, picture: 4 };
const TEXT = {
  items: (n) => n + (n === 1 ? ' item' : ' items'),
  used: (k) => k + ' in disk',
  free: (k) => k + ' available',
  trash: 'Trash',
};

let desktopFolder = null;
let text = TEXT;
// A 20 MB hard disk, unless disk() is given another capacity in K.
let diskCapacity = 20480;
const iconOf = new WeakMap();
let selected = null;
let lastClick = { icon: null, time: 0 };

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

function checkItem({ kind }) {
  if (!ITEM_KINDS.includes(kind)) throw new Error(`Unknown item kind "${kind}"`);
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
  // opens: the window a double-click opens; the icon becomes its opener.
  // Icons that open a folder window are also drop targets. corner: 'top' or
  // 'bottom' parks the icon at that end of the desktop's right edge until
  // it's dragged elsewhere; such icons (the disk and the Trash) can never
  // leave the desktop. kb: the item's own size on disk in K.
  constructor(folder, { label, kind, opens, corner, kb }) {
    const art = icon(kind); // throws on an unknown kind, before any side effects
    this.label = label;
    this.opens = opens;
    this.ownKb = kb ?? (Object.hasOwn(DEFAULT_K, kind) ? DEFAULT_K[kind] : 0);
    this.corner = corner;
    this.pinned = !!corner;
    if (opens) opens.opener = this;
    this.el = el('div', 'icon');
    iconOf.set(this.el, this);
    this.el.tabIndex = 0;
    this.el.setAttribute('role', 'button');
    this.el.setAttribute('aria-label', label);
    this.img = el('div', 'img', this.el);
    this.setKind(kind, art);
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

  setKind(kind, art = icon(kind)) {
    this.kind = kind;
    this.el.dataset.kind = kind;
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

  // --- As the opener of its window ---

  rect() {
    return this.el.isConnected ? rectOf(this.img) : null;
  }

  // Desktop icons sit at the right edge, so their windows open to the left
  // of them; windows opened from inside a folder open just below it.
  placeWindow(win) {
    const parent = this.folder.owner;
    if (parent) return { x: parent.rect.x + 30, y: parent.rect.y + 30 };
    const a = area();
    return { x: this.x - win.rect.w - 24, y: Math.min(this.y, a.y + a.h - win.rect.h - 8) };
  }

  setOpen(open) {
    this.el.classList.toggle('open', open);
  }

  // --- Dragging ---

  // Where a drop at this pointer event would land: { folder, icon? }, or
  // null if the icon can't go there and should stay put.
  dropTarget(ev) {
    for (const e of document.elementsFromPoint(ev.clientX, ev.clientY)) {
      if (this.el.contains(e)) continue;
      const t = nearest(e, '.icon', iconOf);
      if (t && t.opens && t.opens.folder) {
        return this.pinned || isInside(t.opens, this) ? null : { folder: t.opens.folder, icon: t };
      }
      const w = windowAt(e);
      if (w) {
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

// --- Folder windows ---

class FolderWindow extends DesktopWindow {
  constructor(title, size, options) {
    super(title, size, { ...options, info: true });
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

  show() {
    this.updateInfo();
    return super.show();
  }

  // Called by the folder whenever its contents change.
  changed() {
    if (this.el.isConnected) this.updateInfo();
    if (this.onChange) this.onChange();
  }

  // This window's item count, then totals for the whole disk. Everything on
  // the desktop, the Trash included, is on the disk.
  updateInfo() {
    const used = desktopFolder.kb();
    const k = (v) => Math.max(0, v).toLocaleString('en-US') + 'K';
    this.setInfo([text.items(this.folder.items.length), text.used(k(used)), text.free(k(diskCapacity - used))]);
    this.updateScroll();
  }
}

// --- The desktop ---

export class Desktop {
  // text: replaces the Finder's English wording, any of { items(n),
  // used(k), free(k), trash }. labels: close and zoom box names for folder
  // windows, as for DesktopWindow.
  constructor({ text: wording, labels } = {}) {
    if (desktopFolder) throw new Error('Only one Desktop can exist per page.');
    text = { ...TEXT, ...wording };
    this.labels = labels;
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
    // Clicking anywhere but an icon clears the selection; icons stop the event.
    root.addEventListener('pointerdown', () => select(null));
    onResize(arrangeDesktop);
  }

  // A folder window holding icons: [{ label, kind, opens, kb }], where kind
  // is document, picture or folder.
  folderWindow(title, items, size = [320, 160]) {
    items.forEach(checkItem);
    const win = new FolderWindow(title, size, { labels: this.labels });
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
    const win = this.folderWindow(text.trash, items, [240, 130]);
    const ic = new Icon(desktopFolder, { label: text.trash, kind: 'trash', opens: win, corner: 'bottom' });
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
