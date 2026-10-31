// Modal dialog boxes. While one is up, a transparent layer over the whole
// screen swallows pointer input, so the rest of the system never needs to
// check whether a dialog is open.

import { pushButton } from './button.js';
import { icon } from './bitmap.js';
import { el, place, bitmapText } from './dom.js';
import { screen, area, onResize } from './screen.js';

// Shows a w x h dialog box. build(box, close) fills it in and returns the
// button that Return, Enter, Space and Escape press. Resolves with the
// value passed to close().
function dialog(w, h, build) {
  return new Promise((resolve) => {
    const layer = el('div', 'modal', screen());
    const box = el('div', 'dlg', layer);
    box.setAttribute('role', 'alertdialog');
    const center = () => {
      const a = area();
      place(box, {
        x: a.x + Math.floor((a.w - w) / 2),
        y: a.y + Math.max(8, Math.min(Math.floor((a.h - h) / 3), a.h - h - 8)),
        w,
        h,
      });
    };
    center();
    const stopCentering = onResize(center);
    const onKey = (e) => {
      if (['Enter', 'Escape', ' '].includes(e.key)) {
        e.preventDefault();
        def.press();
      }
    };
    const close = (value) => {
      removeEventListener('keydown', onKey);
      stopCentering();
      layer.remove();
      resolve(value);
    };
    const def = build(box, close);
    addEventListener('keydown', onKey);
    def.focus();
  });
}

// The system error dialog with the bomb. Resolves when Restart is pressed.
export function crash(id) {
  const w = 340, h = 104;
  return dialog(w, h, (box, close) => {
    const art = icon('bomb').normal;
    box.appendChild(art);
    place(art, { x: 16, y: 14 });
    for (const [str, y] of [['Sorry, a system error occurred.', 20], ['ID = ' + id, 60]]) {
      const line = bitmapText(str, 'system', 'p');
      box.appendChild(line);
      place(line, { x: 62, y });
    }
    return pushButton(box, 'Restart', { x: w - 4 - 16 - 70, y: h - 4 - 14 - 20, w: 70, h: 20 }, false, close);
  });
}

