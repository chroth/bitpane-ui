// The window manager: windows that can be dragged, resized, zoomed, closed
// and stacked, and that stay inside the visible screen area.
import { arrow, growBox, titleBox } from './bitmap.js';
import * as check from './check.js';
import { el, place, bitmapText, isOver, nearest } from './dom.js';
import { measure } from './font.js';
import { screen, area, onResize, track, outline, zoomRects } from './screen.js';
const TITLE_H = 19;
const INFO_H = 19;
const SCROLL = 16; // scroll bar, including its border line
const MIN_W = 120;
const MIN_H = 90;
const windowOf = new WeakMap();
const openWindows = [];
let topZ = 10;
let cascade = 0;
// The outer size of a window whose content area is `content`.
export function windowSize([w, h], { info = false } = {}) {
    return [w + SCROLL + 2, h + TITLE_H + (info ? INFO_H : 0) + SCROLL + 2];
}
export function windowAt(e) {
    return nearest(e, '.win', windowOf);
}
/** A draggable, resizable, zoomable window. Put your own DOM or canvas in `content`. */
export class DesktopWindow {
    el;
    content;
    opener = null;
    /** Called after the window opens. */
    onShow = null;
    /** Called after the window closes. */
    onHide = null;
    #rect;
    #title;
    #titleW;
    #info = null;
    #infoParts = [];
    #vs;
    #hs;
    #placed = false;
    #zoomed = null;
    #opening = null;
    #wanted = false; // whether the last call was show() rather than hide()
    #returnFocus = null;
    // The title may be empty, for a window without one.
    constructor(title, size, { info = false, labels = {} } = {}) {
        const [w, h] = size;
        check.pixels(w, 'Window width', 1);
        check.pixels(h, 'Window height', 1);
        screen();
        this.#rect = { x: 0, y: 0, w, h };
        this.el = el('div', 'win');
        windowOf.set(this.el, this);
        this.el.setAttribute('role', 'dialog');
        this.el.tabIndex = -1;
        if (title)
            this.el.setAttribute('aria-label', title);
        const tb = el('div', 'tb', this.el);
        const close = this.#titleButton(tb, 'close', labels.close ?? 'Close', () => this.hide());
        this.#title = bitmapText(title);
        this.#title.classList.add('ttl');
        tb.insertBefore(this.#title, close.nextSibling);
        this.#titleW = measure(title, 'system') + 12;
        this.#titleButton(tb, 'zoom', labels.zoom ?? 'Zoom', () => this.toggleZoom());
        let top = TITLE_H;
        if (info) {
            this.#info = el('div', 'info', this.el);
            top += INFO_H;
        }
        this.content = el('div', 'content', this.el);
        this.content.style.top = top + 'px';
        this.#vs = this.#scrollBar('vs', 'up', 'down');
        this.#vs.el.style.top = top - 1 + 'px';
        this.#hs = this.#scrollBar('hs', 'left', 'right');
        const grow = el('div', 'grow', this.el);
        grow.appendChild(growBox());
        this.el.addEventListener('pointerdown', () => this.activate());
        tb.addEventListener('pointerdown', (e) => {
            if (e.button === 0 && !e.target.closest('button'))
                this.#drag(e);
        });
        grow.addEventListener('pointerdown', (e) => this.#resize(e));
        // Scroll bars follow the content without the page having to ask.
        const update = () => this.#updateScroll();
        this.content.addEventListener('scroll', update);
        new ResizeObserver(update).observe(this.content);
        new MutationObserver(update).observe(this.content, { childList: true, subtree: true, attributes: true, characterData: true });
        onResize(() => {
            if (this.#zoomed)
                this.#rect = this.#zoomRect();
            if (this.el.isConnected)
                this.#layout();
        });
    }
    /** Position and size in screen pixels. */
    get rect() {
        return { ...this.#rect };
    }
    /** Moves or resizes the window, keeping it inside the visible area. */
    setRect(changes) {
        const next = { ...this.#rect };
        for (const key of Object.keys(changes)) {
            if (key !== 'x' && key !== 'y' && key !== 'w' && key !== 'h')
                throw new TypeError(`setRect takes x, y, w and h, not "${key}"`);
            next[key] = check.pixels(changes[key], `Window ${key}`, key === 'w' || key === 'h' ? 1 : undefined);
        }
        this.#rect = next;
        if ('x' in changes || 'y' in changes)
            this.#placed = true;
        this.#zoomed = null;
        this.#layout();
    }
    /** Up to three strings for the info line: left, centre and right. */
    setInfo(parts) {
        if (!this.#info)
            throw new Error('setInfo needs a window created with info: true');
        this.#info.replaceChildren();
        this.#infoParts = parts.slice(0, 3).map((str) => {
            const t = bitmapText(str, 'small');
            this.#info.appendChild(t);
            return { t, w: measure(str, 'small') };
        });
        if (this.el.isConnected)
            this.#layout();
    }
    #layout() {
        this.#clamp();
        const r = this.#rect;
        place(this.el, r);
        const inner = r.w - 2;
        this.#title.style.left = Math.max(26, Math.floor((inner - this.#titleW) / 2)) + 'px';
        this.#title.style.maxWidth = Math.max(0, inner - 52) + 'px';
        const [a, b, c] = this.#infoParts;
        if (a)
            a.t.style.left = '8px';
        if (b)
            b.t.style.left = Math.floor((inner - b.w) / 2) + 'px';
        if (c)
            c.t.style.left = inner - 8 - c.w + 'px';
        this.#updateScroll();
    }
    /** Zooms open from the opener, or comes to the front if already open. */
    async show() {
        this.#wanted = true;
        if (this.el.isConnected)
            return this.activate();
        this.#opening ??= this.#open().finally(() => { this.#opening = null; });
        return this.#opening;
    }
    /** Closes the window, or stops it opening if it is still zooming open. */
    hide() {
        this.#wanted = false;
        const index = openWindows.indexOf(this);
        if (index < 0)
            return;
        const hadFocus = this.el.contains(document.activeElement);
        openWindows.splice(index, 1);
        this.el.remove();
        this.opener?.setOpen(false);
        const next = openWindows.at(-1);
        next?.activate();
        if (hadFocus) {
            const back = this.#returnFocus;
            if (back instanceof HTMLElement && back.isConnected && !back.closest('[inert]'))
                back.focus();
            else
                next?.el.focus();
        }
        void zoomRects(this.#rect, this.opener?.rect());
        this.onHide?.();
    }
    activate() {
        for (const w of openWindows)
            if (w !== this)
                w.el.classList.remove('active');
        this.el.classList.add('active');
        if (+this.el.style.zIndex !== topZ)
            this.el.style.zIndex = String(++topZ);
        const i = openWindows.indexOf(this);
        if (i >= 0)
            openWindows.push(...openWindows.splice(i, 1));
    }
    toggleZoom() {
        if (this.#zoomed) {
            this.#rect = this.#zoomed;
            this.#zoomed = null;
        }
        else {
            this.#zoomed = { ...this.#rect };
            this.#rect = this.#zoomRect();
        }
        this.#layout();
    }
    // A zoomed window fills the visible area, and keeps filling it as it changes.
    #zoomRect() {
        const a = area();
        return { x: a.x + 4, y: a.y + 4, w: a.w - 10, h: a.h - 10 };
    }
    /** Runs each time the window is about to open. */
    beforeOpen() { }
    // Focus moves into the window, and goes back where it came from on hide.
    async #open() {
        this.#returnFocus = document.activeElement;
        this.beforeOpen();
        if (!this.#placed)
            this.#placeFirst();
        this.#clamp();
        await zoomRects(this.opener?.rect(), this.#rect);
        if (!this.#wanted)
            return;
        screen().appendChild(this.el);
        openWindows.push(this);
        this.#layout();
        this.activate();
        this.el.focus();
        this.opener?.setOpen(true);
        this.onShow?.();
    }
    #placeFirst() {
        const p = this.opener?.placeWindow(this);
        if (p) {
            Object.assign(this.#rect, p);
        }
        else {
            const a = area(), k = cascade++ % 6;
            Object.assign(this.#rect, { x: a.x + 24 + k * 20, y: a.y + 30 + k * 20 });
        }
        this.#placed = true;
    }
    // Whole window inside the visible area, unless the screen is tiny.
    #clamp() {
        const a = area(), r = this.#rect;
        r.w = Math.min(Math.max(MIN_W, r.w), Math.max(1, a.w - 8));
        r.h = Math.min(Math.max(MIN_H, r.h), Math.max(1, a.h - 8));
        r.x = Math.max(a.x + 4, Math.min(r.x, a.x + a.w - r.w - 4));
        r.y = Math.max(a.y + 4, Math.min(r.y, a.y + a.h - r.h - 4));
    }
    // Close and zoom boxes: highlighted while pressed, fire on release inside.
    #titleButton(tb, kind, name, action) {
        const btn = el('button', kind, tb);
        btn.setAttribute('aria-label', name);
        btn.append(titleBox(kind, false), titleBox(kind, true));
        btn.addEventListener('pointerdown', (e) => {
            if (e.button > 0)
                return;
            e.stopPropagation();
            this.activate();
            btn.classList.add('down');
            track(e, {
                end: (dx, dy, moved, ev) => {
                    btn.classList.remove('down');
                    if (isOver(btn, ev))
                        action();
                },
            });
        });
        btn.addEventListener('click', (e) => {
            if (e.detail === 0)
                action();
        });
        return btn;
    }
    #scrollBar(cls, back, forward) {
        const bar = el('div', cls, this.el);
        el('div', 'track', bar);
        const thumb = el('div', 'thumb', bar);
        for (const [dir, pos, sign] of [[back, 'a1', -1], [forward, 'a2', 1]]) {
            const box = el('div', 'arrow ' + pos, bar);
            const dark = arrow(dir, true);
            dark.classList.add('pressed');
            box.append(arrow(dir, false), dark);
            box.addEventListener('pointerdown', (e) => {
                e.stopPropagation();
                this.activate();
                box.classList.add('down');
                const step = () => {
                    if (cls === 'vs')
                        this.content.scrollTop += sign * 16;
                    else
                        this.content.scrollLeft += sign * 16;
                };
                step();
                const timer = setInterval(step, 80);
                track(e, { end: () => { clearInterval(timer); box.classList.remove('down'); } });
            });
        }
        return { el: bar, thumb };
    }
    #updateScroll() {
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
    #drag(e) {
        let ghost = null;
        track(e, {
            move: (dx, dy) => {
                ghost ??= outline();
                const r = this.#rect;
                ghost.set({ x: r.x + dx, y: r.y + dy, w: r.w + 1, h: r.h + 1 });
            },
            end: (dx, dy, moved) => {
                ghost?.remove();
                if (!moved)
                    return;
                this.#rect.x += dx;
                this.#rect.y += dy;
                this.#layout();
            },
        });
    }
    #resize(e) {
        e.stopPropagation();
        this.activate();
        const r = this.#rect, a = area();
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
                if (!moved)
                    return;
                this.#rect = sized(dx, dy);
                this.#zoomed = null;
                this.#layout();
            },
        });
    }
}
