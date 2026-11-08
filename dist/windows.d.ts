import { type Rect } from './dom.js';
export declare const TITLE_H = 19;
export type Size = readonly [width: number, height: number];
export interface WindowOptions {
    /** Show an info line under the title bar; see setInfo. */
    info?: boolean;
    /** Screen-reader names for the close and zoom boxes. */
    labels?: {
        close?: string;
        zoom?: string;
    };
}
/**
 * Where a window zooms open from and first appears, such as a desktop icon.
 * The window manager knows nothing else about it.
 */
export interface Opener {
    rect(): Rect | null;
    placeWindow(win: DesktopWindow): {
        x: number;
        y: number;
    } | null;
    setOpen(open: boolean): void;
}
export declare function windowAt(e: Element): DesktopWindow | null;
/** A draggable, resizable, zoomable window. Put your own DOM or canvas in `content`. */
export declare class DesktopWindow {
    #private;
    readonly el: HTMLDivElement;
    readonly content: HTMLDivElement;
    /** Position and size; call layout() after changing it. */
    rect: Rect;
    opener: Opener | null;
    /** Called after the window opens. */
    onShow: (() => void) | null;
    /** Called after the window closes. */
    onHide: (() => void) | null;
    constructor(title: string, size: Size, { info, labels }?: WindowOptions);
    /** Up to three strings for the info line: left, centre and right. */
    setInfo(parts: readonly string[]): void;
    /** Applies `rect`, keeping the window inside the visible area, and updates the scroll bars. */
    layout(): void;
    /** Zooms open from the opener, or comes to the front if already open. */
    show(): Promise<void>;
    hide(): void;
    activate(): void;
    toggleZoom(): void;
    /** Runs each time the window is about to open. */
    protected beforeOpen(): void;
}
