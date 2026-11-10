import { type IconArt } from './bitmap.js';
import { type PushButton } from './button.js';
import type { Link } from './check.js';
/** An alert button: a link, or an action that runs after the alert closes. */
export type AlertButton = {
    label: string;
} & ({
    action?: () => void;
} | Link);
export interface AlertOptions {
    icon?: IconArt;
    message: string | readonly string[];
    /** Laid out from the left; the last one is the default, focused first so Return presses it. */
    buttons: readonly AlertButton[];
}
export interface Alert {
    buttons: PushButton[];
    close(): void;
}
export declare function alert({ icon, message, buttons }: AlertOptions): Alert;
