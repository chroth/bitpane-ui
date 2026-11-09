/**
 * A link target. Only http:, https:, mailto: and relative URLs are accepted
 * unless `dangerouslyAllowSchemes` lists the scheme, e.g. `['javascript:']`.
 */
export interface Link {
    href: string;
    dangerouslyAllowSchemes?: readonly string[];
}
export declare function text(value: string, what: string): string;
export declare function pixels(value: number, what: string, min?: number): number;
export declare function href(link: Link, what: string): string;
