import * as check from './check.js';
import { type Rect } from './dom.js';
/** What a button does: run an action, or follow a link like any other link. */
export type ButtonTarget = {
    action: () => void;
} | check.Link;
export type ButtonOptions = {
    label: string;
    rect: Rect;
    isDefault?: boolean;
} & ButtonTarget;
/** A push button: a `<button>`, or an `<a>` when given an href. */
export type PushButton = (HTMLButtonElement | HTMLAnchorElement) & {
    /** Animates a keyboard-style press, then activates the button. */
    press(): void;
};
export declare function pushButton(parent: HTMLElement, options: ButtonOptions): PushButton;
