import { button } from './bitmap.js';
import * as check from './check.js';
import { el, place, isOver } from './dom.js';
import { track } from './screen.js';
// Inverts while pressed. An action fires only if the pointer is released
// over the button; a link is followed by the browser on its usual click.
export function pushButton(parent, options) {
    const { label, rect, isDefault = false } = options;
    const { w, h } = rect;
    check.pixels(w, 'Button width', 1);
    check.pixels(h, 'Button height', 1);
    let b;
    let activate;
    if ('href' in options) {
        const a = el('a', 'btn');
        a.href = check.href(options, 'Button href');
        activate = () => a.click();
        b = a;
    }
    else {
        const btn = el('button', 'btn');
        btn.type = 'button';
        activate = options.action;
        btn.addEventListener('click', (e) => {
            if (e.detail === 0)
                activate(); // keyboard activation
        });
        b = btn;
    }
    const off = button(label, w, h, { isDefault });
    const on = button(label, w, h, { isDefault, pressed: true });
    on.classList.add('on');
    b.append(off, on);
    el('span', 'sr-only', b).textContent = label;
    const pad = isDefault ? 4 : 0;
    place(b, { x: rect.x - pad, y: rect.y - pad, w: off.width, h: off.height });
    parent.appendChild(b);
    b.addEventListener('pointerdown', (e) => {
        if (e.button > 0)
            return;
        b.classList.add('down');
        track(e, {
            end: (dx, dy, moved, ev) => {
                b.classList.remove('down');
                if (!('href' in options) && ev.type !== 'pointercancel' && isOver(b, ev))
                    activate();
            },
        });
    });
    return Object.assign(b, {
        press() {
            b.classList.add('down');
            setTimeout(() => {
                b.classList.remove('down');
                activate();
            }, 120);
        },
    });
}
