import { type IconRows } from './bitmap.js';
import * as check from './check.js';
import { DesktopWindow, type Size, type WindowOptions } from './windows.js';
interface ItemBase {
    label: string;
    /** Size on disk in K. Folders add up what they contain. */
    kb?: number;
    /** Custom icon art instead of the kind's built-in picture. */
    art?: IconRows;
}
export type Item = (ItemBase & {
    kind: 'document' | 'picture' | 'folder';
    opens: DesktopWindow;
})
/** A plain link: a click selects, a double-click or Enter launches, modified clicks open a new tab. */
 | (ItemBase & {
    kind: 'application';
} & check.Link);
export interface Wording {
    items(count: number): string;
    used(k: string): string;
    free(k: string): string;
    trash: string;
}
export interface DesktopOptions {
    /** Disk size in K; folder windows count the space left down from it. */
    capacity?: number;
    text?: Partial<Wording>;
    labels?: WindowOptions['labels'];
}
/** A window of icons, made by Desktop.folderWindow. */
export declare class FolderWindow extends DesktopWindow {
    #private;
    protected beforeOpen(): void;
}
/** Desktop icons, folders, the disk and the Trash. One per page. */
export declare class Desktop {
    #private;
    constructor({ capacity, text, labels }?: DesktopOptions);
    folderWindow(title: string, items: readonly Item[], size?: Size): FolderWindow;
    /** The disk icon, in the top right corner of the desktop. There is one. */
    disk(label: string, folder: FolderWindow): void;
    /** The Trash, in the bottom right corner; it looks full while it holds something. There is one. */
    trash(items: readonly Item[]): void;
}
export {};
