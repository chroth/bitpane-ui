// The Finder: icons on the desktop and in folder windows. Icons can be
// selected, opened, and dragged between folders, the desktop and the Trash.

import { icon, type IconArt, type IconRows } from './bitmap.js';
import * as check from './check.js';
import { el, place, bitmapText, nearest } from './dom.js';
import { measure } from './font.js';
import { screen, area, onResize, pointer, rectOf, track, outline, zoomRects } from './screen.js';
import { DesktopWindow, windowAt, type Opener, type Size, type WindowOptions } from './windows.js';

interface ItemBase {
  label: string;
  /** Size on disk in K. Folders add up what they contain. */
  kb?: number;
  /** Custom icon art instead of the kind's built-in picture. */
  art?: IconRows;
}

export type Item =
  | (ItemBase & { kind: 'document' | 'picture' | 'folder'; opens: DesktopWindow })
  /** A plain link: a click selects, a double-click or Enter launches, modified clicks open a new tab. */
  | (ItemBase & { kind: 'application' } & check.Link);

export interface Wording {
  items(count: number): string;
  used(k: string): string;
  free(k: string): string;
  trash: string;
}

export interface DesktopOptions {
  /** Disk size in K; folder windows count the space left down from it. */
  capacity?: number;
  text?: Partial<Wording>;
  labels?: WindowOptions['labels'];
}

const ENGLISH: Wording = {
  items: (n) => n + (n === 1 ? ' item' : ' items'),
  used: (k) => k + ' in disk',
  free: (k) => k + ' available',
  trash: 'Trash',
};
const DEFAULT_K: Partial<Record<IconArt, number>> = { document: 1, picture: 4, application: 32 };

const iconOf = new WeakMap<Element, Icon>();
let mounted = false;

interface Bounds { x0: number; y0: number; x1: number; y1: number }

const clampTo = (b: Bounds, x: number, y: number): { x: number; y: number } =>
  ({ x: Math.max(b.x0, Math.min(b.x1, x)), y: Math.max(b.y0, Math.min(b.y1, y)) });

// Everything one Desktop knows: its own folder, settings and selection.
class DesktopState {
  readonly folder: Folder;
  #selected: Icon | null = null;
  #lastClick: { icon: Icon | null; time: number } = { icon: null, time: 0 };

  constructor(readonly capacity: number, readonly wording: Wording, readonly labels: WindowOptions['labels']) {
    const root = screen();
    this.folder = new Folder(this, root, null, () => {
      const a = area(), out: [number, number][] = [];
      for (let x = a.x + a.w - 56; x > a.x; x -= 72) for (let y = a.y + 10; y < a.y + a.h - 50; y += 56) out.push([x, y]);
      return out;
    }, () => {
      const a = area();
      return { x0: a.x + 4, y0: a.y + 4, x1: a.x + a.w - 36, y1: a.y + a.h - 50 };
    });
    // Icons stop the event, so this only sees clicks elsewhere.
    root.addEventListener('pointerdown', () => this.select(null));
    onResize(() => this.arrange());
  }

  select(ic: Icon | null): void {
    if (this.#selected && this.#selected !== ic) this.#selected.el.classList.remove('selected');
    this.#selected = ic;
    ic?.el.classList.add('selected');
  }

  isDoubleClick(ic: Icon): boolean {
    const now = Date.now();
    const dbl = this.#lastClick.icon === ic && now - this.#lastClick.time < 500;
    this.#lastClick = dbl ? { icon: null, time: 0 } : { icon: ic, time: now };
    return dbl;
  }

  // Parks corner icons and pulls the rest back on screen.
  arrange(): void {
    const a = area(), b = this.folder.bounds();
    for (const ic of this.folder.items) {
      if (ic.corner === 'top') ic.moveTo(a.x + a.w - 56, a.y + 10);
      else if (ic.corner === 'bottom') ic.moveTo(a.x + a.w - 56, a.y + a.h - 58);
      else {
        const p = clampTo(b, ic.x, ic.y);
        ic.moveTo(p.x, p.y);
      }
    }
  }
}

// The icons in an element: the desktop, or the inside of a folder window.
class Folder {
  readonly items: Icon[] = [];

  constructor(
    readonly desktop: DesktopState,
    readonly content: HTMLElement,
    readonly owner: FolderWindow | null,
    // Free spots in order of preference, and where icons may be dropped.
    readonly slots: () => [number, number][],
    readonly bounds: () => Bounds,
  ) {}

  /** Moves an icon here, to `at` or else the first free slot. */
  add(ic: Icon, at?: { x: number; y: number }): void {
    const old = ic.folder;
    if (old) old.items.splice(old.items.indexOf(ic), 1);
    ic.folder = this;
    this.items.push(ic);
    this.content.appendChild(ic.el);
    if (!at) {
      const slots = this.slots();
      const [x, y] = slots.find(([sx, sy]) =>
        !this.items.some((o) => o !== ic && Math.abs(o.x - sx) < 64 && Math.abs(o.y - sy) < 48)) ?? slots[0] ?? [0, 0];
      at = { x, y };
    }
    const p = clampTo(this.bounds(), at.x, at.y);
    ic.moveTo(p.x, p.y);
    if (old && old !== this) old.owner?.changed();
    this.owner?.changed();
  }

  kb(): number {
    return this.items.reduce((sum, ic) => sum + ic.kb(), 0);
  }
}

interface IconSpec {
  label: string;
  kind: IconArt;
  art?: IconRows | undefined;
  kb?: number | undefined;
  opens?: DesktopWindow;
  href?: string;
  // Parks the icon at that end of the desktop's right edge until it is
  // dragged elsewhere. Such icons (the disk and the Trash) stay on the desktop.
  corner?: 'top' | 'bottom';
}

class Icon implements Opener {
  readonly el: HTMLElement;
  readonly img: HTMLDivElement;
  readonly opens: DesktopWindow | null;
  readonly pinned: boolean;
  folder: Folder | null = null;
  corner: 'top' | 'bottom' | null;
  kind: IconArt;
  x = 0;
  y = 0;
  #href: string | null;
  #art: IconRows | undefined;
  #ownKb: number;
  #labelW: number;

  constructor(folder: Folder, { label, kind, art, kb, opens, href, corner }: IconSpec) {
    const canvases = icon(art ?? kind); // throws on bad art before anything changes
    this.kind = kind;
    this.#art = art;
    this.opens = opens ?? null;
    this.#href = href ?? null;
    this.#ownKb = kb ?? DEFAULT_K[kind] ?? 0;
    this.corner = corner ?? null;
    this.pinned = corner !== undefined;
    if (opens) opens.opener = this;
    if (href === undefined) {
      this.el = el('div', 'icon');
      this.el.setAttribute('role', 'button');
    } else {
      // A plain link underneath: modified and middle clicks open a new tab
      // as usual, while a plain click only selects.
      const a = el('a', 'icon');
      a.href = href;
      a.draggable = false;
      a.addEventListener('click', (e) => {
        if (e.detail === 0) {
          e.preventDefault();
          void this.open();
        } else if (e.button === 0 && !(e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)) {
          e.preventDefault();
        }
      });
      this.el = a;
    }
    iconOf.set(this.el, this);
    this.el.tabIndex = 0;
    this.el.setAttribute('aria-label', label);
    this.img = el('div', 'img', this.el);
    this.setKind(kind, canvases);
    const lbl = bitmapText(label, 'small');
    lbl.classList.add('lbl');
    lbl.setAttribute('aria-hidden', 'true');
    this.el.appendChild(lbl);
    this.#labelW = measure(label, 'small') + 2;
    lbl.style.left = Math.floor((32 - this.#labelW) / 2) + 'px';
    this.el.addEventListener('pointerdown', (e) => this.#down(e));
    this.el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.folder?.desktop.select(this);
        void this.open();
      }
    });
    folder.add(this);
  }

  setKind(kind: IconArt, canvases = icon(this.#art ?? kind)): void {
    this.kind = kind;
    this.el.dataset['kind'] = kind;
    canvases.opened.classList.add('opened');
    canvases.selected.classList.add('sel');
    this.img.replaceChildren(canvases.normal, canvases.opened, canvases.selected);
  }

  moveTo(x: number, y: number): void {
    this.x = x;
    this.y = y;
    place(this.el, { x, y });
  }

  kb(): number {
    return this.#ownKb + (this.opens instanceof FolderWindow ? this.opens.folder.kb() : 0);
  }

  // Links zoom out to the whole screen before the browser follows them.
  async open(): Promise<void> {
    if (this.opens) return this.opens.show();
    if (this.#href) {
      await zoomRects(this.rect(), area());
      location.assign(this.#href);
    }
  }

  rect(): ReturnType<Opener['rect']> {
    return this.el.isConnected ? rectOf(this.img) : null;
  }

  // Desktop icons sit at the right edge, so their windows open to the left
  // of them; windows opened from inside a folder open just below it.
  placeWindow(win: DesktopWindow): { x: number; y: number } {
    const parent = this.folder?.owner;
    if (parent) return { x: parent.rect.x + 30, y: parent.rect.y + 30 };
    const a = area();
    return { x: this.x - win.rect.w - 24, y: Math.min(this.y, a.y + a.h - win.rect.h - 8) };
  }

  setOpen(open: boolean): void {
    this.el.classList.toggle('open', open);
  }

  // True if `win` is the window this icon opens, or somewhere inside it.
  #contains(win: DesktopWindow): boolean {
    for (let w: DesktopWindow | null | undefined = win; w; w = w.opener instanceof Icon ? w.opener.folder?.owner : null) {
      if (w === this.opens) return true;
    }
    return false;
  }

  // Where a drop at this pointer event would land, or null to stay put.
  #dropTarget(ev: PointerEvent): { folder: Folder; icon?: Icon } | null {
    const desktop = this.folder!.desktop;
    for (const e of document.elementsFromPoint(ev.clientX, ev.clientY)) {
      if (this.el.contains(e)) continue;
      const t = nearest(e, '.icon', iconOf);
      if (t?.opens instanceof FolderWindow) {
        return this.pinned || this.#contains(t.opens) ? null : { folder: t.opens.folder, icon: t };
      }
      const w = windowAt(e);
      if (w) return w instanceof FolderWindow && !this.pinned && !this.#contains(w) ? { folder: w.folder } : null;
      if (e === desktop.folder.content) return { folder: desktop.folder };
    }
    return null;
  }

  // Click selects, double-click opens, and dragging moves a gray outline
  // that the icon follows when dropped.
  #down(e: PointerEvent): void {
    if (e.button > 0 || !this.folder) return;
    e.stopPropagation();
    const desktop = this.folder.desktop;
    this.folder.owner?.activate();
    desktop.select(this);
    const start = rectOf(this.img);
    const p0 = pointer(e);
    const grab = { x: p0.x - start.x, y: p0.y - start.y };
    let ghost: HTMLDivElement | null = null;
    let hover: Icon | null = null;
    const setHover = (ic: Icon | null): void => {
      if (hover === ic) return;
      hover?.el.classList.remove('hover');
      hover = ic;
      hover?.el.classList.add('hover');
    };
    track(e, {
      move: (dx, dy, ev) => {
        if (!ghost) {
          ghost = el('div', 'ghost', screen());
          ghost.appendChild(icon(this.#art ?? this.kind).outline);
          outline(ghost).set({ x: Math.floor((32 - this.#labelW) / 2), y: 34, w: this.#labelW, h: 12 });
        }
        place(ghost, { x: start.x + dx, y: start.y + dy, w: 32, h: 32 });
        setHover(this.#dropTarget(ev)?.icon ?? null);
      },
      end: (dx, dy, moved, ev) => {
        ghost?.remove();
        setHover(null);
        if (!moved) {
          if (desktop.isDoubleClick(this)) void this.open();
          return;
        }
        const t = this.#dropTarget(ev);
        if (!t) return;
        if (t.icon) return t.folder.add(this);
        const p = pointer(ev);
        const c = t.folder.content;
        const origin = t.folder === desktop.folder ? { x: 0, y: 0 } : rectOf(c);
        this.corner = null;
        t.folder.add(this, {
          x: Math.round(p.x - grab.x - origin.x + c.scrollLeft),
          y: Math.round(p.y - grab.y - origin.y + c.scrollTop),
        });
      },
    });
  }
}

/** A window of icons, made by Desktop.folderWindow. */
export class FolderWindow extends DesktopWindow {
  /** @internal */
  readonly folder: Folder;
  #desktop: DesktopState;
  #onChange: (() => void) | undefined;

  /** @internal */
  constructor(desktop: DesktopState, title: string, size: Size, onChange?: () => void) {
    super(title, size, { info: true, ...(desktop.labels ? { labels: desktop.labels } : {}) });
    this.#desktop = desktop;
    this.#onChange = onChange;
    this.folder = new Folder(desktop, this.content, this, () => {
      const out: [number, number][] = [];
      for (let row = 0; row < 20; row++) for (let col = 0; col < 4; col++) out.push([30 + col * 90, 16 + row * 60]);
      return out;
    }, () => ({ x0: 4, y0: 4, x1: this.content.clientWidth + 400, y1: this.content.clientHeight + 400 }));
  }

  /** @internal Called by the folder whenever its contents change. */
  changed(): void {
    if (this.el.isConnected) this.#updateInfo();
    this.#onChange?.();
  }

  protected override beforeOpen(): void {
    this.#updateInfo();
  }

  // This window's item count, then totals for the whole disk. Everything on
  // the desktop, the Trash included, is on the disk.
  #updateInfo(): void {
    const { folder, capacity, wording } = this.#desktop;
    const used = folder.kb();
    const k = (v: number): string => Math.max(0, v).toLocaleString('en-US') + 'K';
    this.setInfo([wording.items(this.folder.items.length), wording.used(k(used)), wording.free(k(capacity - used))]);
  }
}

function addItem(folder: Folder, item: Item): void {
  const { label, kind, kb, art } = item;
  if (item.kind === 'application') {
    new Icon(folder, { label, kind, kb, art, href: check.href(item, 'Application href') });
  } else {
    new Icon(folder, { label, kind, kb, art, opens: item.opens });
  }
}

/** Desktop icons, folders, the disk and the Trash. One per page. */
export class Desktop {
  #state: DesktopState;

  constructor({ capacity = 20480, text = {}, labels }: DesktopOptions = {}) {
    if (mounted) throw new Error('Only one Desktop can exist per page');
    if (!(capacity > 0) || !Number.isFinite(capacity)) throw new RangeError('capacity must be a positive number');
    mounted = true;
    this.#state = new DesktopState(capacity, { ...ENGLISH, ...text }, labels);
  }

  folderWindow(title: string, items: readonly Item[], size: Size = [320, 160]): FolderWindow {
    const win = new FolderWindow(this.#state, title, size);
    for (const item of items) addItem(win.folder, item);
    return win;
  }

  /** The disk icon, in the top right corner of the desktop. */
  disk(label: string, folder: FolderWindow): void {
    new Icon(this.#state.folder, { label, kind: 'hd', opens: folder, corner: 'top' });
    this.#state.arrange();
  }

  /** The Trash, in the bottom right corner; it looks full while it holds something. */
  trash(items: readonly Item[]): void {
    const { wording } = this.#state;
    let ic: Icon | null = null;
    const win = new FolderWindow(this.#state, wording.trash, [240, 130], () => ic?.setKind(win.folder.items.length ? 'trashFull' : 'trash'));
    for (const item of items) addItem(win.folder, item);
    ic = new Icon(this.#state.folder, { label: wording.trash, kind: win.folder.items.length ? 'trashFull' : 'trash', opens: win, corner: 'bottom' });
    this.#state.arrange();
  }
}
