// Modal alerts. A transparent layer over the whole screen swallows pointer
// input and everything else is made inert, so nothing outside the alert can
// be clicked, focused or reached with the keyboard while it is open.

import { icon as iconArt, type IconArt } from './bitmap.js';
import { pushButton, type ButtonTarget, type PushButton } from './button.js';
import type { Link } from './check.js';
import { el, place, bitmapText } from './dom.js';
import { measure } from './font.js';
import { screen, area, onResize } from './screen.js';

const PAD = 4; // the dialog's double border

/** An alert button: a link, or an action that runs after the alert closes. */
export type AlertButton = { label: string } & ({ action?: () => void } | Link);

export interface AlertOptions {
  icon?: IconArt;
  message: string | readonly string[];
  /** Laid out from the left; the last one is the default that Return presses. */
  buttons: readonly AlertButton[];
}

export interface Alert {
  buttons: PushButton[];
  close(): void;
}

export function alert({ icon, message, buttons }: AlertOptions): Alert {
  if (!buttons.length) throw new Error('An alert needs at least one button');
  const lines = typeof message === 'string' ? [message] : message;
  const textX = icon ? 62 : 16;
  const widths = buttons.map((b) => Math.max(70, measure(b.label, 'system') + 24));
  const row = widths.reduce((sum, w) => sum + w + 12, -12);
  const w = Math.max(340, textX + Math.max(...lines.map((l) => measure(l, 'system'))) + 20, row + 2 * (PAD + 16));
  const h = Math.max(20 + lines.length * 16, icon ? 46 : 0) + 12 + 20 + 14 + 2 * PAD;

  const root = screen();
  const layer = el('div', 'modal');
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

  // Built before anything goes on the page, so a bad link leaves no trace.
  let x = w - 2 * PAD - 16 - row;
  const y = h - 2 * PAD - 14 - 20;
  const made = buttons.map((b, i) => {
    const rect = { x, y, w: widths[i]!, h: 20 };
    x += widths[i]! + 12;
    const isDefault = buttons.length > 1 && i === buttons.length - 1;
    const target: ButtonTarget = 'href' in b ? b : { action: () => { close(); b.action?.(); } };
    return pushButton(box, { label: b.label, rect, isDefault, ...target });
  });
  const def = made[made.length - 1]!;

  const others = [...document.body.children, ...root.children].filter((n) => n !== root && !(n as HTMLElement).inert) as HTMLElement[];
  for (const n of others) n.inert = true;
  root.appendChild(layer);

  const center = (): void => {
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
  const onKey = (e: KeyboardEvent): void => {
    if (['Enter', 'Escape', ' '].includes(e.key)) {
      e.preventDefault();
      def.press();
    }
  };
  addEventListener('keydown', onKey);
  def.focus();

  function close(): void {
    removeEventListener('keydown', onKey);
    stopCentering();
    layer.remove();
    for (const n of others) n.inert = false;
  }
  return { buttons: made, close };
}
