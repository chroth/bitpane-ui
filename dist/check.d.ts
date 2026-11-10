/** A link target: an http:, https:, mailto: or relative URL, unless the call allows more. */
export interface Link {
    href: string;
}
/**
 * Lets one call accept other link schemes, e.g. `['javascript:']`. It is an
 * option of the call and never part of a link, so that link data from
 * elsewhere cannot allow itself.
 */
export interface LinkOptions {
    dangerouslyAllowSchemes?: readonly string[];
}
export declare function text(value: string, what: string): string;
/** A list short enough to build at once; building is slow in the thousands. */
export declare function count<T>(list: readonly T[], what: string): readonly T[];
export declare function amount(value: number, what: string): number;
export declare function pixels(value: number, what: string, min?: number, max?: number): number;
/** The size of something drawn pixel by pixel, which must stay small enough to draw at once. */
export declare function drawn(value: number, what: string): number;
export declare function href(link: Link, what: string, { dangerouslyAllowSchemes }?: LinkOptions): string;
export declare function src(value: string, what: string): string;
