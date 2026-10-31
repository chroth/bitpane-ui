// Ready-made window contents: a text document and a picture. They are plain
// windows and work with or without a Desktop.

import { measure } from './font.js';
import { el, bitmapText } from './dom.js';
import { DesktopWindow, TITLE_H } from './windows.js';

// A text document sized to fit its lines: strings, or { text, href } links.
// Links open in a new tab without referrer or opener.
export function textWindow(title, lines, options) {
  const widest = Math.max(...lines.map((l) => measure(typeof l === 'string' ? l : l.text, 'system')));
  const win = new DesktopWindow(title, [Math.max(260, widest + 70), lines.length * 16 + 85], options);
  const doc = el('div', 'doc', win.content);
  for (const line of lines) {
    const row = el('div', 'line', doc);
    if (typeof line === 'string') {
      if (line) row.appendChild(bitmapText(line));
      continue;
    }
    const a = bitmapText(line.text, 'system', 'a');
    a.href = line.href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    row.appendChild(a);
  }
  return win;
}

// A picture sized to fit its image, which loads the first time it opens.
class PictureWindow extends DesktopWindow {
  constructor(title, { src, width, height, alt }, options) {
    super(title, [width + 18, height + TITLE_H + 18], options);
    this.src = src;
    this.img = el('img', 'px', this.content);
    Object.assign(this.img, { width, height, alt, draggable: false });
  }

  show() {
    if (!this.img.src) this.img.src = this.src;
    return super.show();
  }
}

export function pictureWindow(title, picture, options) {
  return new PictureWindow(title, picture, options);
}
