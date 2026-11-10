// DOM helpers shared by the screen, controls, windows and the desktop.

import { render, type FontName } from './font.js';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// bitmapText creates text containers only, never elements that run or embed.
const TEXT_TAGS = ['span', 'p', 'div', 'a', 'button', 'label', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const;
export type TextTag = (typeof TEXT_TAGS)[number];

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', parent?: Element): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  parent?.appendChild(e);
  return e;
}

export function place(e: HTMLElement, { x, y, w, h }: { x: number; y: number; w?: number; h?: number }): void {
  e.style.left = x + 'px';
  e.style.top = y + 'px';
  if (w !== undefined) e.style.width = w + 'px';
  if (h !== undefined) e.style.height = h + 'px';
}

/** Bitmap text with a hidden plain-text copy for screen readers. */
export function bitmapText(text: string, font: FontName = 'system', tag: TextTag = 'span'): HTMLElement {
  if (!(TEXT_TAGS as readonly string[]).includes(tag)) throw new TypeError(`bitmapText cannot create a <${tag}>`);
  const e = el(tag, 't');
  el('span', 'sr-only', e).textContent = text;
  e.appendChild(render(text, font));
  return e;
}

/** True when a modifier key asks the browser for a new tab, window or download. */
export function isModified(e: MouseEvent | KeyboardEvent): boolean {
  return e.metaKey || e.ctrlKey || e.shiftKey || e.altKey;
}

// The library object behind the nearest `selector` ancestor of `e`, skipping
// page elements that merely share the class name.
export function nearest<T>(e: Element, selector: string, map: WeakMap<Element, T>): T | null {
  for (let n = e.closest(selector); n; n = n.parentElement?.closest(selector) ?? null) {
    const found = map.get(n);
    if (found) return found;
  }
  return null;
}
