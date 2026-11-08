// Runtime checks for what types cannot promise: text short enough to draw,
// pixel values a canvas can hold, and link schemes. No DOM code here, so
// these also run under Node.

const MAX_TEXT = 500;
const MAX_PIXELS = 10000;
const SAFE_SCHEMES = ['http:', 'https:', 'mailto:'];

/**
 * A link target. Only http:, https:, mailto: and relative URLs are accepted
 * unless `dangerouslyAllowSchemes` lists the scheme, e.g. `['javascript:']`.
 */
export interface Link {
  href: string;
  dangerouslyAllowSchemes?: readonly string[];
}

export function text(value: string, what: string): string {
  if (value.length > MAX_TEXT) throw new RangeError(`${what} is longer than ${MAX_TEXT} characters`);
  return value;
}

export function pixels(value: number, what: string, min = -MAX_PIXELS): number {
  if (!Number.isFinite(value) || value < min || value > MAX_PIXELS) {
    throw new RangeError(`${what} must be a number from ${min} to ${MAX_PIXELS}`);
  }
  return value;
}

// The URL is parsed the way the browser will parse it, so letter case,
// whitespace and control characters cannot disguise a scheme.
export function href({ href, dangerouslyAllowSchemes = [] }: Link, what: string): string {
  for (const s of dangerouslyAllowSchemes) {
    if (!/^[a-z][a-z0-9+.-]*:$/.test(s)) {
      throw new TypeError('dangerouslyAllowSchemes entries must be lowercase schemes such as "javascript:"');
    }
  }
  let scheme: string;
  try {
    scheme = new URL(href, 'https://relative.invalid/').protocol;
  } catch {
    throw new TypeError(`${what} is not a valid URL`);
  }
  if (!SAFE_SCHEMES.includes(scheme) && !dangerouslyAllowSchemes.includes(scheme)) {
    throw new Error(`${what} uses the unsafe URL scheme "${scheme}"; list it in dangerouslyAllowSchemes to allow it on purpose`);
  }
  return href;
}
