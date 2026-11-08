// Ready-made window contents: a text document and a picture. They are plain
// windows and work with or without a Desktop.

import { measure } from './font.js';
import { el, bitmapText } from './dom.js';
import { DesktopWindow, TITLE_H } from './windows.js';
import * as check from './check.js';

// A text document sized to fit its lines: strings, or { text, href } links.
// Links open in a new tab without referrer or opener, and only safe URLs
// are accepted unless options.dangerouslyAllowSchemes says otherwise.
export function textWindow(title, lines, options = {}) {
  check.list(lines, 'Lines', { min: 1 });
  for (const line of lines) {
    if (typeof line === 'string') continue;
    check.object(line, 'A line');
    check.text(line.text, 'Link text', { empty: false });
    check.url(line.href, 'Link href', options.dangerouslyAllowSchemes);
  }
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
  constructor(title, picture, options) {
    const { src, width, height, alt } = check.object(picture, 'Picture');
    check.text(src, 'Picture src', { empty: false });
    check.number(width, 'Picture width', { min: 1, max: 4096 });
    check.number(height, 'Picture height', { min: 1, max: 4096 });
    check.text(alt, 'Picture alt');
    super(title, [width + 18, height + TITLE_H + 18], options);
    this.src = src;
    this.img = el('img', 'px', this.content);
    // Images can't run code, but a third-party host would learn the page URL.
    Object.assign(this.img, { width, height, alt, draggable: false, referrerPolicy: 'no-referrer' });
  }

  show() {
    if (!this.img.src) this.img.src = this.src;
    return super.show();
  }
}

export function pictureWindow(title, picture, options) {
  return new PictureWindow(title, picture, options);
}
