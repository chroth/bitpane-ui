// DOM helpers shared by the screen, the Finder and dialogs.

import { render } from './font.js';

export function el(tag, cls, parent) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (parent) parent.appendChild(e);
  return e;
}

// Positions an absolutely placed element. Width and height are optional.
export function place(e, { x, y, w, h }) {
  e.style.left = x + 'px';
  e.style.top = y + 'px';
  if (w != null) e.style.width = w + 'px';
  if (h != null) e.style.height = h + 'px';
}

// Bitmap text that screen readers still read as text.
export function bitmapText(str, font = 'system', tag = 'span') {
  const e = el(tag, 't');
  el('span', 'sr-only', e).textContent = str;
  e.appendChild(render(str, font));
  return e;
}

// True if a pointer event ended over `e`, including any enlarged touch
// area its CSS gives it.
export function isOver(e, event) {
  return e.contains(document.elementFromPoint(event.clientX, event.clientY));
}

