import { button } from './bitmap.js';
import { el, place, isOver } from './dom.js';
import { track } from './screen.js';

// A rounded push button. It inverts while pressed and fires only if the
// pointer is released over it, like the real thing.
export function pushButton(parent, label, { x, y, w, h }, isDefault, onPress) {
  const b = el('button', 'btn', parent);
  b.type = 'button';
  const off = button(label, w, h, { isDefault });
  const on = button(label, w, h, { isDefault, pressed: true });
  on.classList.add('on');
  b.append(off, on);
  el('span', 'sr-only', b).textContent = label;
  const pad = isDefault ? 4 : 0;
  place(b, { x: x - pad, y: y - pad, w: off.width, h: off.height });
  b.press = () => {
    b.classList.add('down');
    setTimeout(() => {
      b.classList.remove('down');
      onPress();
    }, 120);
  };
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
