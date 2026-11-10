// DOM helpers shared by the screen, controls, windows and the desktop.
import { render } from './font.js';
// bitmapText creates text containers only, never elements that run or embed.
const TEXT_TAGS = ['span', 'p', 'div', 'a', 'button', 'label', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
export function el(tag, cls = '', parent) {
    const e = document.createElement(tag);
    if (cls)
        e.className = cls;
    parent?.appendChild(e);
    return e;
}
export function place(e, { x, y, w, h }) {
    e.style.left = x + 'px';
    e.style.top = y + 'px';
    if (w !== undefined)
        e.style.width = w + 'px';
    if (h !== undefined)
        e.style.height = h + 'px';
}
/** Bitmap text with a hidden plain-text copy for screen readers. */
export function bitmapText(text, font = 'system', tag = 'span') {
    if (!TEXT_TAGS.includes(tag))
        throw new TypeError(`bitmapText cannot create a <${tag}>`);
    const e = el(tag, 't');
    el('span', 'sr-only', e).textContent = text;
    e.appendChild(render(text, font));
    return e;
}
/** True when a modifier key asks the browser for a new tab, window or download. */
export function isModified(e) {
    return e.metaKey || e.ctrlKey || e.shiftKey || e.altKey;
}
// The library object behind the nearest `selector` ancestor of `e`, skipping
// page elements that merely share the class name.
export function nearest(e, selector, map) {
    for (let n = e.closest(selector); n; n = n.parentElement?.closest(selector) ?? null) {
        const found = map.get(n);
        if (found)
            return found;
    }
    return null;
}
