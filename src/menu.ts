// The optional menu bar, one per screen, drawn in the same bitmap font as
// windows. Nothing is added to the page until menuBar() is called. Each menu
// is a popover its title opens: the browser opens and closes it, closes it on
// Escape or a click elsewhere, focuses its first item and returns focus to
// the title. Arrow keys move between items and menus.

import { bitmapText, el } from './dom.js';
import { screen, area, onResize, reserveMenu, rectOf } from './screen.js';

const HEIGHT = 22;
let mounted = false;

export interface MenuItem {
  label: string;
  action: () => void;
  disabled?: boolean;
}

export interface Menu {
  label: string;
  /** null draws a separator. */
  items: readonly (MenuItem | null)[];
}

/** Mounts the menu bar. Returns a function that removes it. */
export function menuBar(menus: readonly Menu[], { label = 'Application menu' } = {}): () => void {
  if (mounted) throw new Error('There is only one menu bar');
  // Built off the page, so a bad label leaves no trace.
  const bar = el('nav', 'menu-bar');
  bar.setAttribute('aria-label', label);
  const triggers: HTMLButtonElement[] = [];
  const popups: HTMLDivElement[] = [];
  const isOpen = (popup: HTMLElement): boolean => popup.matches(':popover-open');

  for (const menu of menus) {
    const trigger = bitmapText(menu.label, 'system', 'button') as HTMLButtonElement;
    trigger.type = 'button';
    trigger.setAttribute('aria-haspopup', 'menu');
    bar.appendChild(trigger);
    const popup = el('div', 'menu-popup', bar);
    popup.popover = 'auto';
    popup.setAttribute('role', 'menu');
    popup.setAttribute('aria-label', menu.label);
    trigger.popoverTargetElement = popup;
    triggers.push(trigger);
    popups.push(popup);

    const items: HTMLButtonElement[] = [];
    for (const item of menu.items) {
      if (!item) {
        el('div', 'menu-separator', popup).setAttribute('role', 'separator');
        continue;
      }
      const button = bitmapText(item.label, 'system', 'button') as HTMLButtonElement;
      button.type = 'button';
      button.setAttribute('role', 'menuitem');
      button.disabled = !!item.disabled;
      button.tabIndex = -1;
      popup.appendChild(button);
      if (!button.disabled) items.push(button);
      button.addEventListener('click', () => {
        popup.hidePopover();
        item.action();
      });
    }
    if (items[0]) items[0].autofocus = true;

    // A popover sits in the top layer, outside the scaled screen: the
    // stylesheet scales it, and this puts it under its title, on screen.
    new ResizeObserver(() => {
      if (!isOpen(popup)) return;
      const a = area(), t = rectOf(trigger);
      const x = Math.max(a.x, Math.min(t.x, a.x + a.w - popup.offsetWidth));
      popup.style.setProperty('--x', x + 'px');
      popup.style.setProperty('--y', a.y - 1 + 'px');
    }).observe(popup);

    trigger.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      if (!isOpen(popup)) popup.showPopover();
      if (e.key === 'ArrowUp') items.at(-1)?.focus();
    });
    popup.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') return popup.hidePopover();
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
      e.preventDefault();
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      const next = e.key === 'Home' ? 0
        : e.key === 'End' ? items.length - 1
        : (index + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items[next]?.focus();
    });
  }

  // Left and Right move between menus, opening the next one if one was open.
  bar.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const open = popups.findIndex(isOpen);
    const index = open >= 0 ? open : triggers.indexOf(document.activeElement as HTMLButtonElement);
    const next = (index + (e.key === 'ArrowRight' ? 1 : -1) + triggers.length) % triggers.length;
    if (open >= 0) popups[next]!.showPopover();
    else triggers[next]!.focus();
  });

  const layout = (): void => {
    for (const popup of popups) if (isOpen(popup)) popup.hidePopover();
    const a = area();
    Object.assign(bar.style, { left: a.x + 'px', top: a.y - HEIGHT + 'px', width: a.w + 'px' });
  };
  screen().appendChild(bar);
  mounted = true;
  reserveMenu(HEIGHT);
  layout();
  const stop = onResize(layout);
  return () => {
    stop();
    bar.remove();
    mounted = false;
    reserveMenu(0);
  };
}
