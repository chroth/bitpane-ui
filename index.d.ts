/** All coordinates and sizes are logical screen pixels, before integer scaling. */
export interface Rect { x: number; y: number; w: number; h: number }
export type Size = [width: number, height: number];
export type TextLine = string | { text: string; href: string };
export interface IconItem {
  label: string;
  kind: 'document' | 'picture' | 'folder' | 'hd' | 'trash' | 'trashFull';
  opens: DesktopWindow;
  /** Size on disk in K. Defaults: document 1, picture 4; folders add their contents. */
  kb?: number;
}

/** A draggable, resizable window. Append your own DOM or canvas to content. */
export class DesktopWindow {
  constructor(title: string, size: Size);
  readonly el: HTMLDivElement;
  readonly content: HTMLDivElement;
  rect: Rect;
  show(): Promise<void>;
  hide(): void;
  activate(): void;
  toggleZoom(): void;
  /** Recalculate scroll indicators after changing the content. */
  layout(): void;
}

/** Optional desktop icons and folder/document helpers; one Desktop per page. */
export class Desktop {
  constructor();
  textWindow(title: string, lines: TextLine[]): DesktopWindow;
  pictureWindow(title: string, picture: {
    src: string; width: number; height: number; alt: string;
  }): DesktopWindow;
  folderWindow(title: string, items: IconItem[], size?: Size): DesktopWindow;
  /** capacity: disk size in K (default 20480). Windows show disk-wide used and available space. */
  disk(label: string, window: DesktopWindow, options?: { capacity?: number }): void;
  trash(items: IconItem[]): void;
}

export interface PushButton extends HTMLButtonElement {
  /** Animate a keyboard-style press and invoke its action. */
  press(): void;
}
export function pushButton(
  parent: HTMLElement, label: string, rect: Rect,
  isDefault: boolean, onPress: () => void
): PushButton;
export interface MenuItem { label: string; action: () => void; disabled?: boolean }
export interface Menu { label: string; items: (MenuItem | null)[] }
/** Mount the optional menu bar. Returns its removal function. */
export function menuBar(menus: Menu[]): () => void;
export function screen(): HTMLDivElement;
/** Usable area excluding safe insets and the optional menu bar. */
export function area(): Rect;
export function onResize(callback: () => void): () => void;
export function bitmapText(text: string, font?: 'system' | 'small', tag?: string): HTMLElement;
export function crash(id: string | number): Promise<void>;
export function restart(href: string): void;
