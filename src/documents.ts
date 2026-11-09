// Ready-made window contents: a text document and a picture. They are plain
// windows and work with or without a Desktop.

import * as check from './check.js';
import { el, bitmapText } from './dom.js';
import { measure } from './font.js';
import { DesktopWindow, windowSize, type WindowOptions } from './windows.js';

/** A line of text, or a link that opens in a new tab without referrer or opener. */
export type TextLine = string | ({ text: string } & check.Link);

export function textWindow(title: string, lines: readonly TextLine[], options?: WindowOptions): DesktopWindow {
  // Links are checked before the window exists, so a bad one leaves no trace.
  const hrefs = lines.map((l) => (typeof l === 'string' ? null : check.href(l, 'Link href')));
  const widest = Math.max(...lines.map((l) => measure(typeof l === 'string' ? l : l.text, 'system')));
  const win = new DesktopWindow(title, windowSize([Math.max(242, widest + 52), lines.length * 16 + 48], options), options);
  const doc = el('div', 'doc', win.content);
  lines.forEach((line, i) => {
    const row = el('div', 'line', doc);
    if (typeof line === 'string') {
      if (line) row.appendChild(bitmapText(line));
      return;
    }
    const a = bitmapText(line.text, 'system', 'a') as HTMLAnchorElement;
    a.href = hrefs[i]!;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    row.appendChild(a);
  });
  return win;
}

export interface Picture {
  src: string;
  width: number;
  height: number;
  alt: string;
}

// Loads its image the first time it opens, without sending a referrer.
class PictureWindow extends DesktopWindow {
  #img: HTMLImageElement;
  #src: string;

  constructor(title: string, { src, width, height, alt }: Picture, options?: WindowOptions) {
    check.pixels(width, 'Picture width', 1);
    check.pixels(height, 'Picture height', 1);
    super(title, windowSize([width, height], options), options);
    this.#src = src;
    this.#img = el('img', 'px', this.content);
    Object.assign(this.#img, { width, height, alt, draggable: false, referrerPolicy: 'no-referrer' });
  }

  protected override beforeOpen(): void {
    if (!this.#img.src) this.#img.src = this.#src;
  }
}

export function pictureWindow(title: string, picture: Picture, options?: WindowOptions): DesktopWindow {
  return new PictureWindow(title, picture, options);
}
