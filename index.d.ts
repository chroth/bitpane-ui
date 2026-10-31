/** All coordinates and sizes are logical screen pixels, before integer scaling. */
export interface Rect { x: number; y: number; w: number; h: number }
export type Size = [width: number, height: number];
export type IconArt = 'document' | 'picture' | 'folder' | 'hd' | 'trash' | 'trashFull' | 'bomb';

// --- Screen ---

export function screen(): HTMLDivElement;
/** Usable area excluding safe insets and the optional menu bar. */
export function area(): Rect;
export function onResize(callback: () => void): () => void;

// --- Controls ---

export function bitmapText(text: string, font?: 'system' | 'small', tag?: string): HTMLElement;
export interface Pressable {
  /** Animate a keyboard-style press, then activate. */
  press(): void;
}
export function pushButton(
  parent: HTMLElement, label: string, rect: Rect,
  isDefault: boolean, onPress: () => void
): HTMLButtonElement & Pressable;
/** A push button that is a plain link underneath. */
export function linkButton(
  parent: HTMLElement, label: string, rect: Rect,
  href: string, isDefault?: boolean
): HTMLAnchorElement & Pressable;
export interface MenuItem { label: string; action: () => void; disabled?: boolean }
export interface Menu { label: string; items: (MenuItem | null)[] }
/** Mount the optional menu bar. Returns its removal function. */
export function menuBar(menus: Menu[], options?: { label?: string }): () => void;
export type AlertButton = { label: string; href: string } | { label: string; action?: () => void };
/** Modal alert. The last button is the default; action buttons close the alert first. */
export function alert(options: {
  icon?: IconArt; message: string | string[]; buttons: AlertButton[];
}): { buttons: (HTMLElement & Pressable)[]; close(): void };

// --- Windows ---

export interface WindowOptions {
  /** Screen-reader names for the close and zoom boxes. */
  labels?: { close?: string; zoom?: string };
}
/** Anything a window zooms open from and is placed by, such as a desktop icon. */
export interface Opener {
  rect(): Rect | null;
  placeWindow(window: DesktopWindow): { x: number; y: number } | null;
  setOpen(open: boolean): void;
}
/** A draggable, resizable window. Append your own DOM or canvas to content. */
export class DesktopWindow {
  constructor(title: string, size: Size, options?: WindowOptions & { info?: boolean });
  readonly el: HTMLDivElement;
  readonly content: HTMLDivElement;
  rect: Rect;
  opener: Opener | null;
  show(): Promise<void>;
  hide(): void;
  activate(): void;
  toggleZoom(): void;
  /** Up to three strings for the info line (left, centre, right); needs info: true. */
  setInfo(parts: string[]): void;
  /** Recalculate scroll indicators after changing the content. */
  layout(): void;
}
export type TextLine = string | { text: string; href: string };
export function textWindow(title: string, lines: TextLine[], options?: WindowOptions): DesktopWindow;
export function pictureWindow(title: string, picture: {
  src: string; width: number; height: number; alt: string;
}, options?: WindowOptions): DesktopWindow;

// --- Finder ---

export interface IconItem {
  label: string;
  kind: 'document' | 'picture' | 'folder';
  opens: DesktopWindow;
  /** Size on disk in K. Defaults: document 1, picture 4; folders add their contents. */
  kb?: number;
}
/** Desktop icons, folders, the disk and the Trash; one Desktop per page. */
export class Desktop {
  constructor(options?: {
    text?: {
      items?: (count: number) => string;
      used?: (k: string) => string;
      free?: (k: string) => string;
      trash?: string;
    };
    labels?: WindowOptions['labels'];
  });
  folderWindow(title: string, items: IconItem[], size?: Size): DesktopWindow;
  /** capacity: disk size in K (default 20480). Windows show disk-wide used and available space. */
  disk(label: string, folder: DesktopWindow, options?: { capacity?: number }): void;
  trash(items: IconItem[]): void;
}
