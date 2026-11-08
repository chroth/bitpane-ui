export type IconArt = 'application' | 'hd' | 'trash' | 'trashFull' | 'document' | 'picture' | 'folder' | 'bomb';
/** Custom icon art: up to 32 rows of up to 32 "0" or "1" characters, centred. */
export type IconRows = readonly string[];
export interface IconCanvases {
    normal: HTMLCanvasElement;
    selected: HTMLCanvasElement;
    outline: HTMLCanvasElement;
    opened: HTMLCanvasElement;
}
export declare function icon(art: IconArt | IconRows): IconCanvases;
export declare function button(label: string, w: number, h: number, { isDefault, pressed }?: {
    isDefault?: boolean | undefined;
    pressed?: boolean | undefined;
}): HTMLCanvasElement;
export declare function titleBox(kind: 'close' | 'zoom', pressed: boolean): HTMLCanvasElement;
export type Direction = 'up' | 'down' | 'left' | 'right';
export declare function arrow(dir: Direction, filled: boolean): HTMLCanvasElement;
export declare function growBox(): HTMLCanvasElement;
export declare function corner(): HTMLCanvasElement;
export declare function cursorURL(scale: number): string;
