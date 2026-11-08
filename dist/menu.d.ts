export interface MenuItem {
    label: string;
    action: () => void;
    disabled?: boolean;
}
export interface Menu {
    label: string;
    /** null draws a separator. */
    items: readonly (MenuItem | null)[];
}
/** Mounts the menu bar. Returns a function that removes it. */
export declare function menuBar(menus: readonly Menu[], { label }?: {
    label?: string | undefined;
}): () => void;
