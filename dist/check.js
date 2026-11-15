// Runtime checks for what types cannot promise: text short enough to draw,
// pixel values a canvas can hold, and link schemes. No DOM code here, so
// these also run under Node.
const MAX_TEXT = 500;
const MAX_PIXELS = 10000;
const MAX_DRAWN = 1000; // for what is drawn pixel by pixel, such as buttons
const MAX_COUNT = 200; // items in one folder or menu, menus in the bar
const SAFE_SCHEMES = ['http:', 'https:', 'mailto:'];
const IMAGE_SCHEMES = ['http:', 'https:', 'data:', 'blob:'];
export function text(value, what) {
    if (value.length > MAX_TEXT)
        throw new RangeError(`${what} is longer than ${MAX_TEXT} characters`);
    return value;
}
/** A list short enough to build at once; building is slow in the thousands. */
export function count(list, what) {
    if (list.length > MAX_COUNT)
        throw new RangeError(`${what} has more than ${MAX_COUNT} entries`);
    return list;
}
export function amount(value, what) {
    if (!Number.isFinite(value) || value < 0)
        throw new RangeError(`${what} must be a number of 0 or more`);
    return value;
}
export function pixels(value, what, min = -MAX_PIXELS, max = MAX_PIXELS) {
    if (!Number.isFinite(value) || value < min || value > max) {
        throw new RangeError(`${what} must be a number from ${min} to ${max}`);
    }
    return value;
}
/** The size of something drawn pixel by pixel, which must stay small enough to draw at once. */
export function drawn(value, what) {
    return pixels(value, what, 1, MAX_DRAWN);
}
// Returns the checked string, which callers must use instead of the input:
// both are converted to strings once here, so an object cannot stringify to
// one URL when checked and another when used. The URL is parsed the way the
// browser will parse it, so letter case, whitespace and control characters
// cannot disguise a scheme; anything without a scheme is relative and takes
// the page's own.
export function href(link, what, { dangerouslyAllowSchemes = [] } = {}) {
    if (link.href == null)
        throw new TypeError(`${what} is missing`);
    if ('dangerouslyAllowSchemes' in link)
        throw new TypeError('dangerouslyAllowSchemes is an option of the call, not part of a link');
    const value = String(link.href);
    const allowed = Array.from(dangerouslyAllowSchemes, String);
    for (const s of allowed) {
        if (!/^[a-z][a-z0-9+.-]*:$/.test(s)) {
            throw new TypeError('dangerouslyAllowSchemes entries must be lowercase schemes such as "javascript:"');
        }
    }
    let scheme;
    try {
        scheme = new URL(value, 'https://relative.invalid/').protocol;
    }
    catch {
        throw new TypeError(`${what} is not a valid URL`);
    }
    if (!SAFE_SCHEMES.includes(scheme) && !allowed.includes(scheme)) {
        throw new Error(`${what} uses the unsafe URL scheme "${scheme}"; list it in the call's dangerouslyAllowSchemes option to allow it on purpose`);
    }
    return value;
}
// An image address. The browser requests it as soon as the picture opens, so
// it must come from the page itself, never from a visitor or other data.
export function src(value, what) {
    const str = String(value);
    let scheme;
    try {
        scheme = new URL(str, 'https://relative.invalid/').protocol;
    }
    catch {
        throw new TypeError(`${what} is not a valid URL`);
    }
    if (!IMAGE_SCHEMES.includes(scheme))
        throw new Error(`${what} uses the URL scheme "${scheme}", which cannot be a picture`);
    return str;
}
