import * as check from './check.js';
import { DesktopWindow, type WindowOptions } from './windows.js';
/** A line of text, or a link that opens in a new tab without referrer or opener. */
export type TextLine = string | ({
    text: string;
} & check.Link);
export declare function textWindow(title: string, lines: readonly TextLine[], options?: WindowOptions & check.LinkOptions): DesktopWindow;
export interface Picture {
    src: string;
    width: number;
    height: number;
    alt: string;
}
export declare function pictureWindow(title: string, picture: Picture, options?: WindowOptions): DesktopWindow;
