export type FontName = 'system' | 'small';
interface Glyph {
    y: number;
    w: number;
    rows: string[];
}
interface Font {
    lineHeight: number;
    top: number;
    glyphs: Map<string, Glyph>;
}
export declare const FONTS: Record<FontName, Font>;
export declare function measure(str: string, fontName: FontName): number;
export declare function render(lines: string | string[], fontName: FontName, color?: string): HTMLCanvasElement;
export {};
