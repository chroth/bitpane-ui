import { type FontName } from './font.js';
export interface Rect {
    x: number;
    y: number;
    w: number;
    h: number;
}
declare const TEXT_TAGS: readonly ['span', 'p', 'div', 'a', 'button', 'label', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
export type TextTag = (typeof TEXT_TAGS)[number];
export declare function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, parent?: Element): HTMLElementTagNameMap[K];
export declare function place(e: HTMLElement, { x, y, w, h }: {
    x: number;
    y: number;
    w?: number;
    h?: number;
}): void;
/** Bitmap text with a hidden plain-text copy for screen readers. */
export declare function bitmapText(text: string, font?: FontName, tag?: TextTag): HTMLElement;
/** True when a modifier key asks the browser for a new tab, window or download. */
export declare function isModified(e: MouseEvent | KeyboardEvent): boolean;
export declare function nearest<T>(e: Element, selector: string, map: WeakMap<Element, T>): T | null;
export {};
