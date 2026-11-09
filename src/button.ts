import { buttonArt } from './bitmap.js';
import * as check from './check.js';
import { el, place, isOver, type Rect } from './dom.js';
import { track } from './screen.js';

/** What a button does: run an action, or follow a link like any other link. */
export type ButtonTarget = { action: () => void } | check.Link;

export type ButtonOptions = { label: string; rect: Rect; isDefault?: boolean } & ButtonTarget;

/** A push button: a `<button>`, or an `<a>` when given an href. */
export type PushButton = (HTMLButtonElement | HTMLAnchorElement) & {
  /** Animates a keyboard-style press, then activates the button. */
  press(): void;
};

// Inverts while pressed. An action fires only if the pointer is released
// over the button; a link is followed by the browser on its usual click.
export function pushButton(parent: HTMLElement, options: ButtonOptions): PushButton {
  const { label, rect, isDefault = false } = options;
  const { x, y, w, h } = rect;
  check.pixels(x, 'Button x');
  check.pixels(y, 'Button y');
  check.pixels(w, 'Button width', 1);
  check.pixels(h, 'Button height', 1);
  let b: HTMLElement;
  let activate: () => void;
  if ('href' in options) {
    const a = el('a', 'btn');
    a.href = check.href(options, 'Button href');
    activate = () => a.click();
    b = a;
  } else {
    const btn = el('button', 'btn');
    btn.type = 'button';
    activate = options.action;
    btn.addEventListener('click', (e) => {
      if (e.detail === 0) activate(); // keyboard activation
    });
    b = btn;
  }
  const off = buttonArt(label, w, h, { isDefault });
  const on = buttonArt(label, w, h, { isDefault, pressed: true });
  on.classList.add('on');
  b.append(off, on);
  el('span', 'sr-only', b).textContent = label;
  const pad = isDefault ? 4 : 0;
  place(b, { x: x - pad, y: y - pad, w: off.width, h: off.height });
  parent.appendChild(b);

  b.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    b.classList.add('down');
    track(e, {
      end: (dx, dy, moved, ev) => {
        b.classList.remove('down');
        if (!('href' in options) && ev.type !== 'pointercancel' && isOver(b, ev)) activate();
      },
    });
  });
  return Object.assign(b as HTMLButtonElement | HTMLAnchorElement, {
    press(): void {
      b.classList.add('down');
      setTimeout(() => {
        b.classList.remove('down');
        activate();
      }, 120);
    },
  });
}
