import { buttonArt } from './bitmap.js';
import * as check from './check.js';
import { el, place, type Rect } from './dom.js';

/** What a button does: run an action, or follow a link like any other link. */
export type ButtonTarget = { action: () => void } | check.Link;

export type ButtonOptions = { label: string; rect: Rect; isDefault?: boolean } & ButtonTarget;

/** A push button: a `<button>`, or an `<a>` when given an href. */
export type PushButton = HTMLButtonElement | HTMLAnchorElement;

// The browser decides when it is pressed: a click, Enter or Space, a tap.
// It looks pressed while :active.
export function pushButton(parent: HTMLElement, options: ButtonOptions, linkOptions?: check.LinkOptions): PushButton {
  const { label, rect, isDefault = false } = options;
  const { x, y, w, h } = rect;
  check.pixels(x, 'Button x');
  check.pixels(y, 'Button y');
  check.drawn(w, 'Button width');
  check.drawn(h, 'Button height');
  let b: PushButton;
  if ('href' in options) {
    b = el('a', 'btn');
    b.href = check.href(options, 'Button href', linkOptions);
    b.referrerPolicy = 'no-referrer';
  } else {
    const { action } = options;
    b = el('button', 'btn');
    b.type = 'button';
    b.addEventListener('click', () => action());
  }
  const off = buttonArt(label, w, h, { isDefault });
  const on = buttonArt(label, w, h, { isDefault, pressed: true });
  on.classList.add('on');
  b.append(off, on);
  el('span', 'sr-only', b).textContent = label;
  const pad = isDefault ? 4 : 0;
  place(b, { x: x - pad, y: y - pad, w: off.width, h: off.height });
  parent.appendChild(b);
  return b;
}
