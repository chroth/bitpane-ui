import { button } from './bitmap.js';
import { el, place, isOver } from './dom.js';
import { track } from './screen.js';
import * as check from './check.js';

// Draws a push button's normal and pressed looks into element `b`.
function dress(b, label, rect, isDefault) {
  check.text(label, 'Button label', { empty: false });
  check.rect(rect, 'Button rect');
  check.flag(isDefault, 'isDefault');
  const { x, y, w, h } = rect;
  const off = button(label, w, h, { isDefault });
  const on = button(label, w, h, { isDefault, pressed: true });
  on.classList.add('on');
  b.append(off, on);
  el('span', 'sr-only', b).textContent = label;
  const pad = isDefault ? 4 : 0;
  place(b, { x: x - pad, y: y - pad, w: off.width, h: off.height });
  // Animates a keyboard-style press, then activates the button.
  b.press = () => {
    b.classList.add('down');
    setTimeout(() => {
      b.classList.remove('down');
      b.activate();
    }, 120);
  };
}

// A rounded push button. It inverts while pressed and fires only if the
// pointer is released over it, like the real thing.
export function pushButton(parent, label, rect, isDefault, onPress) {
  check.fn(onPress, 'onPress');
  const b = el('button', 'btn', parent);
  b.type = 'button';
  dress(b, label, rect, isDefault);
  b.activate = onPress;
  b.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    b.classList.add('down');
    track(e, {
      end: (dx, dy, moved, ev) => {
        b.classList.remove('down');
        if (ev.type !== 'pointercancel' && isOver(b, ev)) onPress();
      },
    });
  });
  b.addEventListener('click', (e) => {
    if (e.detail === 0) onPress();
  });
  return b;
}

// A push button that is a plain link underneath: the browser follows href
// on click, middle-click or Enter, exactly as for any other link. Only safe
// URLs unless dangerouslyAllowSchemes says otherwise (see check.url).
export function linkButton(parent, label, rect, href, isDefault = false, { dangerouslyAllowSchemes } = {}) {
  check.url(href, 'Link button href', dangerouslyAllowSchemes);
  const a = el('a', 'btn', parent);
  a.href = href;
  dress(a, label, rect, isDefault);
  a.activate = () => a.click();
  a.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    a.classList.add('down');
    track(e, { end: () => a.classList.remove('down') });
  });
  return a;
}
