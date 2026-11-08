// Input checks for the public API. Bad input fails at once with a clear
// error instead of misbehaving later, and links are safe by default.
// No DOM code here, so the checks also run in Node tests.

const MAX_TEXT = 500;
const MAX_PIXELS = 10000;
const SAFE_SCHEMES = ['http:', 'https:', 'mailto:'];

export function text(value, what, { empty = true } = {}) {
  if (typeof value !== 'string') throw new TypeError(`${what} must be a string`);
  if (!empty && !value) throw new TypeError(`${what} must not be empty`);
  if (value.length > MAX_TEXT) throw new RangeError(`${what} is longer than ${MAX_TEXT} characters`);
  return value;
}

export function number(value, what, { min = -MAX_PIXELS, max = MAX_PIXELS } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new RangeError(`${what} must be a number from ${min} to ${max}`);
  }
  return value;
}

export function flag(value, what) {
  if (typeof value !== 'boolean') throw new TypeError(`${what} must be true or false`);
  return value;
}

export function fn(value, what) {
  if (typeof value !== 'function') throw new TypeError(`${what} must be a function`);
  return value;
}

export function list(value, what, { min = 0, max = 1000 } = {}) {
  if (!Array.isArray(value)) throw new TypeError(`${what} must be an array`);
  if (value.length < min || value.length > max) throw new RangeError(`${what} must have ${min} to ${max} entries`);
  return value;
}

export function object(value, what) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new TypeError(`${what} must be an object`);
  return value;
}

export function size(value, what) {
  list(value, what, { min: 2, max: 2 });
  value.forEach((v, i) => number(v, `${what}[${i}]`, { min: 1 }));
  return value;
}

export function rect(value, what) {
  object(value, what);
  number(value.x, `${what}.x`);
  number(value.y, `${what}.y`);
  number(value.w, `${what}.w`, { min: 1 });
  number(value.h, `${what}.h`, { min: 1 });
  return value;
}

// Links accept http(s), mailto and relative URLs. Any other scheme, such as
// javascript: or data:, throws unless this call lists it in
// unsafeAllowSchemes on purpose. The URL is parsed the way the browser will
// parse it, so letter case, whitespace and control characters cannot
// disguise a scheme.
export function url(href, what, unsafeAllowSchemes = []) {
  text(href, what);
  list(unsafeAllowSchemes, 'unsafeAllowSchemes').forEach((s) => {
    if (typeof s !== 'string' || !/^[a-z][a-z0-9+.-]*:$/.test(s)) {
      throw new TypeError('unsafeAllowSchemes entries must be lowercase schemes such as "javascript:"');
    }
  });
  let scheme;
  try {
    scheme = new URL(href, 'https://relative.invalid/').protocol;
  } catch {
    throw new TypeError(`${what} is not a valid URL`);
  }
  if (!SAFE_SCHEMES.includes(scheme) && !unsafeAllowSchemes.includes(scheme)) {
    throw new Error(`${what} uses the unsafe URL scheme "${scheme}"; list it in unsafeAllowSchemes to allow it on purpose`);
  }
  return href;
}
