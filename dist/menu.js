// The optional menu bar, one per screen, drawn in the same bitmap font as
// windows. Nothing is added to the page until menuBar() is called.
import { bitmapText, el } from './dom.js';
import { screen, area, onResize, reserveMenu } from './screen.js';
const HEIGHT = 22;
let mounted = false;
/** Mounts the menu bar. Returns a function that removes it. */
export function menuBar(menus, { label = 'Application menu' } = {}) {
    if (mounted)
        throw new Error('There is only one menu bar');
    mounted = true;
    const bar = el('nav', 'menu-bar', screen());
    bar.setAttribute('aria-label', label);
    let active = null;
    const triggers = [];
    const openers = new Map();
    const close = (restoreFocus = false) => {
        if (!active)
            return;
        const { trigger, popup } = active;
        popup.hidden = true;
        trigger.setAttribute('aria-expanded', 'false');
        active = null;
        if (restoreFocus)
            trigger.focus();
    };
    for (const menu of menus) {
        const group = el('div', 'menu-group', bar);
        const trigger = bitmapText(menu.label, 'system', 'button');
        trigger.type = 'button';
        trigger.setAttribute('aria-haspopup', 'menu');
        trigger.setAttribute('aria-expanded', 'false');
        group.appendChild(trigger);
        triggers.push(trigger);
        const popup = el('div', 'menu-popup', group);
        popup.hidden = true;
        popup.setAttribute('role', 'menu');
        popup.setAttribute('aria-label', menu.label);
        const items = [];
        for (const item of menu.items) {
            if (!item) {
                el('div', 'menu-separator', popup).setAttribute('role', 'separator');
                continue;
            }
            const button = bitmapText(item.label, 'system', 'button');
            button.type = 'button';
            button.setAttribute('role', 'menuitem');
            button.disabled = !!item.disabled;
            button.tabIndex = -1;
            popup.appendChild(button);
            if (!button.disabled)
                items.push(button);
            button.addEventListener('click', () => {
                close(true);
                item.action();
            });
        }
        const open = (last = false) => {
            close();
            popup.hidden = false;
            trigger.setAttribute('aria-expanded', 'true');
            active = { trigger, popup };
            // Shift menus at the right edge left so they stay on narrow screens.
            popup.style.left = '0px';
            const overflow = popup.getBoundingClientRect().right - bar.getBoundingClientRect().right;
            if (overflow > 0)
                popup.style.left = -Math.ceil(overflow / (bar.getBoundingClientRect().width / bar.offsetWidth)) + 'px';
            (last ? items.at(-1) : items[0])?.focus();
        };
        openers.set(trigger, () => open());
        trigger.addEventListener('click', () => (active?.trigger === trigger ? close(true) : open()));
        trigger.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                open(e.key === 'ArrowUp');
            }
        });
        popup.addEventListener('keydown', (e) => {
            const index = items.indexOf(document.activeElement);
            if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
                e.preventDefault();
                const next = e.key === 'Home' ? 0
                    : e.key === 'End' ? items.length - 1
                        : (index + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
                items[next]?.focus();
            }
        });
    }
    // Left and Right move between menus, opening the next one if one was open.
    const onKey = (e) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            close(true);
        }
        if (e.key === 'Tab')
            close();
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            e.preventDefault();
            const current = active?.trigger ?? document.activeElement;
            const index = triggers.indexOf(current);
            const next = triggers[(index + (e.key === 'ArrowRight' ? 1 : -1) + triggers.length) % triggers.length];
            const wasOpen = active !== null;
            close();
            if (wasOpen)
                openers.get(next)();
            else
                next.focus();
        }
    };
    const outside = (e) => { if (!bar.contains(e.target))
        close(); };
    const blur = (e) => { if (!bar.contains(e.relatedTarget))
        close(); };
    const layout = () => {
        close();
        const a = area();
        Object.assign(bar.style, { left: a.x + 'px', top: a.y - HEIGHT + 'px', width: a.w + 'px' });
    };
    reserveMenu(HEIGHT);
    layout();
    const stop = onResize(layout);
    bar.addEventListener('keydown', onKey);
    bar.addEventListener('focusout', blur);
    document.addEventListener('pointerdown', outside);
    return () => {
        stop();
        document.removeEventListener('pointerdown', outside);
        bar.remove();
        mounted = false;
        reserveMenu(0);
    };
}
