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

export function amount(value: number, what: string): number {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${what} must be a number of 0 or more`);
  return value;
}

export function pixels(value: number, what: string, min = -MAX_PIXELS): number {
  if (!Number.isFinite(value) || value < min || value > MAX_PIXELS) {
    throw new RangeError(`${what} must be a number from ${min} to ${MAX_PIXELS}`);
  }
  return value;
}

// Returns the checked string, which callers must use instead of the input:
// both are converted to strings once here, so an object cannot stringify to
// one URL when checked and another when used. The URL is parsed the way the
// browser will parse it, so letter case, whitespace and control characters
// cannot disguise a scheme; anything without a scheme is relative and takes
// the page's own.
export function href(link: Link, what: string): string {
  if (link.href == null) throw new TypeError(`${what} is missing`);
  const value = String(link.href);
  const allowed = Array.from(link.dangerouslyAllowSchemes ?? [], String);
  for (const s of allowed) {
    if (!/^[a-z][a-z0-9+.-]*:$/.test(s)) {
      throw new TypeError('dangerouslyAllowSchemes entries must be lowercase schemes such as "javascript:"');
    }
  }
  let scheme: string;
  try {
    scheme = new URL(value, 'https://relative.invalid/').protocol;
  } catch {
    throw new TypeError(`${what} is not a valid URL`);
  }
  if (!SAFE_SCHEMES.includes(scheme) && !allowed.includes(scheme)) {
    throw new Error(`${what} uses the unsafe URL scheme "${scheme}"; list it in dangerouslyAllowSchemes to allow it on purpose`);
  }
  return value;
}
