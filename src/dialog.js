// Modal alert dialogs. While one is up, a transparent layer over the whole
// screen swallows pointer input, so the rest of the system never needs to
// check whether a dialog is open.

import { linkButton, pushButton } from './button.js';
import { icon as iconArt } from './bitmap.js';
import { measure } from './font.js';
import { el, place, bitmapText } from './dom.js';
import { screen, area, onResize } from './screen.js';

const PAD = 4; // the dialog's double border

// Shows an alert: an optional icon, a message (a string or lines) and a row
// of buttons on the right. A button is { label, href } (a link) or
// { label, action } (closes the alert, then runs action). The last button
// is the default: Return, Enter, Space and Escape press it. Returns
// { buttons, close }.
export function alert({ icon, message, buttons }) {
  const lines = typeof message === 'string' ? [message] : message;
  const textX = icon ? 62 : 16;
  const widths = buttons.map((b) => Math.max(70, measure(b.label, 'system') + 24));
  const row = widths.reduce((sum, w) => sum + w + 12, -12);
  const w = Math.max(340, textX + Math.max(...lines.map((l) => measure(l, 'system'))) + 20, row + 2 * (PAD + 16));
  const textBottom = 20 + lines.length * 16;
  const h = Math.max(textBottom, icon ? 46 : 0) + 12 + 20 + 14 + 2 * PAD;

  const layer = el('div', 'modal', screen());
  const box = el('div', 'dlg', layer);
  box.setAttribute('role', 'alertdialog');
  if (icon) {
    const art = iconArt(icon).normal;
    box.appendChild(art);
    place(art, { x: 16, y: 14 });
  }
  lines.forEach((str, i) => {
    if (!str) return;
    const line = bitmapText(str, 'system', 'p');
    box.appendChild(line);
    place(line, { x: textX, y: 20 + i * 16 });
  });

  const close = () => {
    removeEventListener('keydown', onKey);
    stopCentering();
    layer.remove();
  };
  let x = w - 2 * PAD - 16 - row;
  const y = h - 2 * PAD - 14 - 20;
  const made = buttons.map((b, i) => {
    const rect = { x, y, w: widths[i], h: 20 };
    const isDefault = i === buttons.length - 1;
    x += widths[i] + 12;
    return b.href !== undefined
      ? linkButton(box, b.label, rect, b.href, isDefault && buttons.length > 1)
      : pushButton(box, b.label, rect, isDefault && buttons.length > 1, () => { close(); b.action?.(); });
  });

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
  const def = made[made.length - 1];
  const onKey = (e) => {
    if (['Enter', 'Escape', ' '].includes(e.key)) {
      e.preventDefault();
      def.press();
    }
  };
  addEventListener('keydown', onKey);
  def.focus();
  return { buttons: made, close };
}
