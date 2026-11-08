import { type Rect } from './dom.js';
/** The screen element, created on first use. */
export declare function screen(): HTMLDivElement;
/** The visible screen area, clear of the menu bar and the safe-area insets. */
export declare function area(): Rect;
/** Calls `fn` whenever area() changes. Returns a function that stops it. */
export declare function onResize(fn: () => void): () => void;
export declare function pointer(event: PointerEvent): {
    x: number;
    y: number;
};
export declare function rectOf(e: Element): Rect;
export interface Drag {
    move?(dx: number, dy: number, ev: PointerEvent): void;
    end?(dx: number, dy: number, moved: boolean, ev: PointerEvent): void;
}
/** Follows a pointer drag that started with `event` until release. */
export declare function track(event: PointerEvent, { move, end }: Drag): void;
export interface Outline {
    set(r: Rect): void;
    remove(): void;
}
/** A 50% gray outline rectangle, as drawn while dragging. */
export declare function outline(parent?: HTMLElement): Outline;
/** Expanding outlines from one rectangle to another; skipped when either is missing or motion is reduced. */
export declare function zoomRects(from: Rect | null | undefined, to: Rect | null | undefined): Promise<void>;
export declare function reserveMenu(height: number): void;
