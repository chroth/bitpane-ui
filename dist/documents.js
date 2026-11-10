// Ready-made window contents: a text document and a picture. They are plain
// windows and work with or without a Desktop.
import * as check from './check.js';
import { el, bitmapText } from './dom.js';
import { measure } from './font.js';
import { DesktopWindow, windowSize } from './windows.js';
export function textWindow(title, lines, options) {
    // Lines are checked before the window exists, so a bad one leaves no trace.
    const hrefs = lines.map((l) => {
        check.text(typeof l === 'string' ? l : l.text, 'Text');
        return typeof l === 'string' ? null : check.href(l, 'Link href', options);
    });
    const widest = Math.max(...lines.map((l) => measure(typeof l === 'string' ? l : l.text, 'system')));
    const win = new DesktopWindow(title, windowSize([Math.max(242, widest + 52), lines.length * 16 + 48], options), options);
    const doc = el('div', 'doc', win.content);
    lines.forEach((line, i) => {
        const row = el('div', 'line', doc);
        if (typeof line === 'string') {
            if (line)
                row.appendChild(bitmapText(line));
            return;
        }
        const a = bitmapText(line.text, 'system', 'a');
        a.href = hrefs[i];
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        row.appendChild(a);
    });
    return win;
}
// Loads its image the first time it opens, without sending a referrer.
class PictureWindow extends DesktopWindow {
    #img;
    #src;
    constructor(title, { src, width, height, alt }, options) {
        check.pixels(width, 'Picture width', 1);
        check.pixels(height, 'Picture height', 1);
        super(title, windowSize([width, height], options), options);
        this.#src = src;
        this.#img = el('img', 'px', this.content);
        Object.assign(this.#img, { width, height, alt, draggable: false, referrerPolicy: 'no-referrer' });
    }
    beforeOpen() {
        if (!this.#img.src)
            this.#img.src = this.#src;
    }
}
export function pictureWindow(title, picture, options) {
    return new PictureWindow(title, picture, options);
}
