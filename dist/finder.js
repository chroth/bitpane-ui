// The Finder: icons on the desktop and in folder windows. Icons can be
// selected, opened, and dragged between folders, the desktop and the Trash.
var _a;
import { icon } from './bitmap.js';
import * as check from './check.js';
import { el, place, bitmapText, nearest, isModified } from './dom.js';
import { measure } from './font.js';
import { screen, area, onResize, pointer, rectOf, track, outline, zoomRects } from './screen.js';
import { DesktopWindow, windowAt } from './windows.js';
const ENGLISH = {
    items: (n) => n + (n === 1 ? ' item' : ' items'),
    used: (k) => k + ' in disk',
    free: (k) => k + ' available',
    trash: 'Trash',
};
const DEFAULT_K = { document: 1, picture: 4, application: 32 };
const iconOf = new WeakMap();
let mounted = false;
const clampTo = (b, x, y) => ({ x: Math.max(b.x0, Math.min(b.x1, x)), y: Math.max(b.y0, Math.min(b.y1, y)) });
// Everything one Desktop knows: its own folder, settings and selection.
class DesktopState {
    capacity;
    wording;
    labels;
    folder;
    #selected = null;
    constructor(capacity, wording, labels) {
        this.capacity = capacity;
        this.wording = wording;
        this.labels = labels;
        const root = screen();
        this.folder = new Folder(this, root, null, () => {
            const a = area(), out = [];
            for (let x = a.x + a.w - 56; x > a.x; x -= 72)
                for (let y = a.y + 10; y < a.y + a.h - 50; y += 56)
                    out.push([x, y]);
            return out;
        }, () => {
            const a = area();
            return { x0: a.x + 4, y0: a.y + 4, x1: a.x + a.w - 36, y1: a.y + a.h - 50 };
        });
        // Icons stop the event, so this only sees clicks elsewhere.
        root.addEventListener('pointerdown', () => this.select(null));
        onResize(() => this.arrange());
    }
    select(ic) {
        if (this.#selected && this.#selected !== ic)
            this.#selected.el.classList.remove('selected');
        this.#selected = ic;
        ic?.el.classList.add('selected');
    }
    // Parks corner icons and pulls the rest back on screen.
    arrange() {
        const a = area(), b = this.folder.bounds();
        for (const ic of this.folder.items) {
            if (ic.corner === 'top')
                ic.moveTo(a.x + a.w - 56, a.y + 10);
            else if (ic.corner === 'bottom')
                ic.moveTo(a.x + a.w - 56, a.y + a.h - 58);
            else {
                const p = clampTo(b, ic.x, ic.y);
                ic.moveTo(p.x, p.y);
            }
        }
    }
}
// The icons in an element: the desktop, or the inside of a folder window.
class Folder {
    desktop;
    content;
    owner;
    slots;
    bounds;
    items = [];
    constructor(desktop, content, owner, 
    // Free spots in order of preference, and where icons may be dropped.
    slots, bounds) {
        this.desktop = desktop;
        this.content = content;
        this.owner = owner;
        this.slots = slots;
        this.bounds = bounds;
    }
    /** Moves an icon here, to `at` or else the first free slot. */
    add(ic, at) {
        const old = ic.folder;
        if (old)
            old.items.splice(old.items.indexOf(ic), 1);
        ic.folder = this;
        this.items.push(ic);
        this.content.appendChild(ic.el);
        if (!at) {
            const slots = this.slots();
            const [x, y] = slots.find(([sx, sy]) => !this.items.some((o) => o !== ic && Math.abs(o.x - sx) < 64 && Math.abs(o.y - sy) < 48)) ?? slots[0] ?? [0, 0];
            at = { x, y };
        }
        const p = clampTo(this.bounds(), at.x, at.y);
        ic.moveTo(p.x, p.y);
        if (old && old !== this)
            old.owner?.changed();
        this.owner?.changed();
    }
    kb() {
        return this.items.reduce((sum, ic) => sum + ic.kb(), 0);
    }
}
class Icon {
    el;
    img;
    opens;
    pinned;
    folder = null;
    corner;
    kind;
    x = 0;
    y = 0;
    #href;
    #art;
    #ownKb;
    #labelW;
    constructor(folder, { label, kind, art, kb, opens, href, corner }) {
        const canvases = icon(art ?? kind); // throws on bad art before anything changes
        this.kind = kind;
        this.#art = art;
        this.opens = opens ?? null;
        this.#href = href ?? null;
        this.#ownKb = kb ?? DEFAULT_K[kind] ?? 0;
        this.corner = corner ?? null;
        this.pinned = corner !== undefined;
        if (opens)
            opens.opener = this;
        if (href === undefined) {
            this.el = el('div', 'icon');
            this.el.setAttribute('role', 'button');
        }
        else {
            // A plain link underneath: modified clicks and keys and middle clicks
            // open a new tab as usual, while a plain click only selects.
            const a = el('a', 'icon');
            a.href = href;
            a.draggable = false;
            a.addEventListener('click', (e) => {
                if (e.button !== 0 || isModified(e))
                    return;
                e.preventDefault();
                if (e.detail === 0)
                    void this.open(); // keyboard activation
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
        this.el.addEventListener('dblclick', () => void this.open());
        this.el.addEventListener('keydown', (e) => {
            if (href !== undefined && e.key === 'Enter' && isModified(e))
                return;
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                this.folder?.desktop.select(this);
                void this.open();
            }
        });
        folder.add(this);
    }
    setKind(kind, canvases = icon(this.#art ?? kind)) {
        this.kind = kind;
        this.el.dataset['kind'] = kind;
        canvases.opened.classList.add('opened');
        canvases.selected.classList.add('sel');
        this.img.replaceChildren(canvases.normal, canvases.opened, canvases.selected);
    }
    moveTo(x, y) {
        this.x = x;
        this.y = y;
        place(this.el, { x, y });
    }
    kb() {
        return this.#ownKb + (this.opens instanceof FolderWindow ? this.opens.folder.kb() : 0);
    }
    // Links zoom out to the whole screen before the browser follows them.
    async open() {
        if (this.opens)
            return this.opens.show();
        if (this.#href) {
            await zoomRects(this.rect(), area());
            location.assign(this.#href);
        }
    }
    rect() {
        return this.el.isConnected ? rectOf(this.img) : null;
    }
    // Desktop icons sit at the right edge, so their windows open to the left
    // of them; windows opened from inside a folder open just below it.
    placeWindow(win) {
        const parent = this.folder?.owner;
        if (parent)
            return { x: parent.rect.x + 30, y: parent.rect.y + 30 };
        const a = area();
        return { x: this.x - win.rect.w - 24, y: Math.min(this.y, a.y + a.h - win.rect.h - 8) };
    }
    setOpen(open) {
        this.el.classList.toggle('open', open);
    }
    // True if `win` is the window this icon opens, or somewhere inside it.
    #contains(win) {
        for (let w = win; w; w = w.opener instanceof _a ? w.opener.folder?.owner : null) {
            if (w === this.opens)
                return true;
        }
        return false;
    }
    // Where a drop at this pointer event would land, or null to stay put.
    #dropTarget(ev) {
        const desktop = this.folder.desktop;
        for (const e of document.elementsFromPoint(ev.clientX, ev.clientY)) {
            if (this.el.contains(e))
                continue;
            const t = nearest(e, '.icon', iconOf);
            if (t?.opens instanceof FolderWindow) {
                return this.pinned || this.#contains(t.opens) ? null : { folder: t.opens.folder, icon: t };
            }
            const w = windowAt(e);
            if (w)
                return w instanceof FolderWindow && !this.pinned && !this.#contains(w) ? { folder: w.folder } : null;
            if (e === desktop.folder.content)
                return { folder: desktop.folder };
        }
        return null;
    }
    // Pressing selects and dragging moves a gray outline that the icon follows
    // when dropped; a double-click opens it.
    #down(e) {
        if (e.button > 0 || !this.folder)
            return;
        e.stopPropagation();
        const desktop = this.folder.desktop;
        this.folder.owner?.activate();
        desktop.select(this);
        const start = rectOf(this.img);
        const p0 = pointer(e);
        const grab = { x: p0.x - start.x, y: p0.y - start.y };
        let ghost = null;
        let hover = null;
        const setHover = (ic) => {
            if (hover === ic)
                return;
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
                if (!moved)
                    return;
                const t = this.#dropTarget(ev);
                if (!t)
                    return;
                if (t.icon)
                    return t.folder.add(this);
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
_a = Icon;
/** A window of icons, made by Desktop.folderWindow. */
export class FolderWindow extends DesktopWindow {
    /** @internal */
    folder;
    #desktop;
    #onChange;
    /** @internal */
    constructor(desktop, title, size, onChange) {
        super(title, size, { info: true, ...(desktop.labels ? { labels: desktop.labels } : {}) });
        this.#desktop = desktop;
        this.#onChange = onChange;
        this.folder = new Folder(desktop, this.content, this, () => {
            const out = [];
            for (let row = 0; row < 20; row++)
                for (let col = 0; col < 4; col++)
                    out.push([30 + col * 90, 16 + row * 60]);
            return out;
        }, () => ({ x0: 4, y0: 4, x1: this.content.clientWidth + 400, y1: this.content.clientHeight + 400 }));
    }
    /** @internal Called by the folder whenever its contents change. */
    changed() {
        if (this.el.isConnected)
            this.#updateInfo();
        this.#onChange?.();
    }
    beforeOpen() {
        this.#updateInfo();
    }
    // This window's item count, then totals for the whole disk. Everything on
    // the desktop, the Trash included, is on the disk.
    #updateInfo() {
        const { folder, capacity, wording } = this.#desktop;
        const used = folder.kb();
        const k = (v) => Math.max(0, v).toLocaleString('en-US') + 'K';
        this.setInfo([wording.items(this.folder.items.length), wording.used(k(used)), wording.free(k(capacity - used))]);
    }
}
// A window belongs to the one icon that opens it.
function claim(win, claimed) {
    if (!(win instanceof DesktopWindow))
        throw new TypeError('An icon must open a DesktopWindow');
    if (win.opener || claimed.has(win))
        throw new Error('A window can be opened by only one icon');
    claimed.add(win);
    return win;
}
// Checks every item before anything is made, so a bad one leaves no trace.
function iconSpecs(items) {
    const claimed = new Set();
    return items.map((item) => {
        const { label, kind, kb, art } = item;
        check.text(label, 'Item label');
        icon(art ?? kind); // throws on an unknown kind or bad art
        if (kb !== undefined)
            check.amount(kb, 'Item kb');
        return item.kind === 'application'
            ? { label, kind, kb, art, href: check.href(item, 'Application href') }
            : { label, kind, kb, art, opens: claim(item.opens, claimed) };
    });
}
/** Desktop icons, folders, the disk and the Trash. One per page. */
export class Desktop {
    #state;
    #hasDisk = false;
    #hasTrash = false;
    constructor({ capacity = 20480, text = {}, labels } = {}) {
        if (mounted)
            throw new Error('Only one Desktop can exist per page');
        if (!(capacity > 0) || !Number.isFinite(capacity))
            throw new RangeError('capacity must be a positive number');
        mounted = true;
        this.#state = new DesktopState(capacity, { ...ENGLISH, ...text }, labels);
    }
    folderWindow(title, items, size = [320, 160]) {
        const specs = iconSpecs(items);
        const win = new FolderWindow(this.#state, title, size);
        for (const spec of specs)
            new Icon(win.folder, spec);
        return win;
    }
    /** The disk icon, in the top right corner of the desktop. There is one. */
    disk(label, folder) {
        if (this.#hasDisk)
            throw new Error('A Desktop has only one disk');
        check.text(label, 'Disk label');
        new Icon(this.#state.folder, { label, kind: 'hd', opens: claim(folder, new Set()), corner: 'top' });
        this.#hasDisk = true;
        this.#state.arrange();
    }
    /** The Trash, in the bottom right corner; it looks full while it holds something. There is one. */
    trash(items) {
        if (this.#hasTrash)
            throw new Error('A Desktop has only one Trash');
        const specs = iconSpecs(items);
        const { wording } = this.#state;
        let ic = null;
        const win = new FolderWindow(this.#state, wording.trash, [240, 130], () => ic?.setKind(win.folder.items.length ? 'trashFull' : 'trash'));
        for (const spec of specs)
            new Icon(win.folder, spec);
        ic = new Icon(this.#state.folder, { label: wording.trash, kind: win.folder.items.length ? 'trashFull' : 'trash', opens: win, corner: 'bottom' });
        this.#hasTrash = true;
        this.#state.arrange();
    }
}
