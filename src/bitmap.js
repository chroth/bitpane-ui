// 1-bit bitmap drawing: icons, buttons, scroll arrows, cursor, screen corners.
// Everything is drawn procedurally, pixel by pixel, so no images are needed.

import { render } from './font.js';

class Bitmap {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.px = new Uint8Array(w * h);
  }
  get(x, y) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.px[y * this.w + x] : 0;
  }
  set(x, y, v = 1) {
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.px[y * this.w + x] = v;
  }
  fill(x0, y0, x1, y1, v = 1) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y, v);
  }
  hline(x0, x1, y, v = 1) { this.fill(x0, y, x1, y, v); }
  vline(x, y0, y1, v = 1) { this.fill(x, y0, x, y1, v); }
  rect(x0, y0, x1, y1, v = 1) {
    this.hline(x0, x1, y0, v); this.hline(x0, x1, y1, v);
    this.vline(x0, y0, y1, v); this.vline(x1, y0, y1, v);
  }
  line(x0, y0, x1, y1, v = 1) {
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, v);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  disc(cx, cy, r, v = 1) {
    for (let y = -r; y <= r; y++)
      for (let x = -r; x <= r; x++)
        if (x * x + y * y <= r * r + r * 0.8) this.set(cx + x, cy + y, v);
  }
  circle(cx, cy, r) {
    const s = new Bitmap(this.w, this.h);
    s.disc(cx, cy, r);
    this.or(s.edge());
  }
  // Filled rounded rectangle with pixel-exact corners.
  roundRect(x0, y0, x1, y1, r, v = 1) {
    for (let y = y0; y <= y1; y++) {
      let inset = 0;
      const dy = y < y0 + r ? y0 + r - y - 0.5 : y > y1 - r ? y - (y1 - r) - 0.5 : -1;
      if (dy >= 0) inset = Math.round(r - Math.sqrt(Math.max(0, r * r - dy * dy)));
      this.hline(x0 + inset, x1 - inset, y, v);
    }
  }
  or(b) {
    for (let i = 0; i < this.px.length; i++) if (b.px[i]) this.px[i] = 1;
    return this;
  }
  minus(b) {
    for (let i = 0; i < this.px.length; i++) if (b.px[i]) this.px[i] = 0;
    return this;
  }
  // Pixels of the shape that touch the outside (4-connected).
  edge() {
    const out = new Bitmap(this.w, this.h);
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++)
        if (this.get(x, y) && !(this.get(x - 1, y) && this.get(x + 1, y) && this.get(x, y - 1) && this.get(x, y + 1)))
          out.set(x, y);
    return out;
  }
  // Everything not reachable from the border through blank pixels.
  mask() {
    const outside = new Uint8Array(this.w * this.h);
    const stack = [];
    for (let x = 0; x < this.w; x++) stack.push([x, 0], [x, this.h - 1]);
    for (let y = 0; y < this.h; y++) stack.push([0, y], [this.w - 1, y]);
    while (stack.length) {
      const [x, y] = stack.pop();
      if (x < 0 || y < 0 || x >= this.w || y >= this.h) continue;
      const i = y * this.w + x;
      if (outside[i] || this.px[i]) continue;
      outside[i] = 1;
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    const m = new Bitmap(this.w, this.h);
    for (let i = 0; i < m.px.length; i++) m.px[i] = outside[i] ? 0 : 1;
    return m;
  }
  dilate() {
    const out = new Bitmap(this.w, this.h);
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++)
        if (this.get(x, y) || this.get(x - 1, y) || this.get(x + 1, y) || this.get(x, y - 1) || this.get(x, y + 1) ||
            this.get(x - 1, y - 1) || this.get(x + 1, y - 1) || this.get(x - 1, y + 1) || this.get(x + 1, y + 1))
          out.set(x, y);
    return out;
  }
  flipX() {
    const out = new Bitmap(this.w, this.h);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) out.set(this.w - 1 - x, y, this.get(x, y));
    return out;
  }
  flipY() {
    const out = new Bitmap(this.w, this.h);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) out.set(x, this.h - 1 - y, this.get(x, y));
    return out;
  }
  transpose() {
    const out = new Bitmap(this.h, this.w);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) out.set(y, x, this.get(x, y));
    return out;
  }
}

// layers: [[bitmap, color], ...] painted in order onto a transparent canvas.
function paint(w, h, layers, scale = 1) {
  const c = document.createElement('canvas');
  c.width = w * scale;
  c.height = h * scale;
  const ctx = c.getContext('2d');
  for (const [bmp, color] of layers) {
    ctx.fillStyle = color;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        if (bmp.get(x, y)) ctx.fillRect(x * scale, y * scale, scale, scale);
  }
  c.className = 'px';
  c.setAttribute('aria-hidden', 'true');
  return c;
}

// Draws the pixels where (x + y) is even, the classic 50% gray outline.
function checker(bmp) {
  const out = new Bitmap(bmp.w, bmp.h);
  for (let y = 0; y < bmp.h; y++) for (let x = 0; x < bmp.w; x++) if (bmp.get(x, y) && (x + y) % 2 === 0) out.set(x, y);
  return out;
}

// --- Icons (32x32) ---

const ICONS = {
  hd(b) {
    b.rect(1, 11, 29, 22);
    b.hline(2, 28, 19);
    b.fill(4, 20, 6, 21);
    b.hline(2, 30, 23);
    b.vline(30, 12, 23);
  },
  trash(b) {
    b.rect(13, 2, 19, 5);
    b.rect(6, 5, 26, 8);
    b.line(8, 9, 9, 30);
    b.line(24, 9, 23, 30);
    b.hline(9, 23, 30);
    for (const x of [12, 16, 20]) b.vline(x, 11, 27);
  },
  trashFull(b) {
    b.rect(15, 0, 21, 2);
    b.line(5, 6, 26, 2);
    b.line(5, 7, 26, 3);
    b.line(5, 6, 5, 7);
    b.line(26, 2, 26, 3);
    b.line(9, 8, 12, 5);
    b.line(13, 7, 17, 5);
    b.line(18, 7, 21, 4);
    b.hline(7, 25, 8);
    b.line(8, 9, 9, 30);
    b.line(24, 9, 23, 30);
    b.hline(9, 23, 30);
    for (const x of [12, 16, 20]) b.vline(x, 11, 27);
  },
  document(b) {
    b.hline(5, 20, 1);
    b.line(20, 1, 26, 7);
    b.vline(26, 7, 30);
    b.hline(5, 26, 30);
    b.vline(5, 1, 30);
    b.vline(20, 1, 7);
    b.hline(20, 26, 7);
    [[22, 11], [18, 14], [22, 17], [20, 20], [16, 23]].forEach(([x1, y]) => b.hline(9, x1, y));
  },
  picture(b) {
    ICONS.document(b);
    b.fill(9, 10, 22, 23, 0);
    b.rect(9, 11, 22, 25);
    b.circle(18, 15, 2);
    for (let i = 0; i < 6; i++) b.hline(13 - i, 13 + i, 18 + i);
    b.hline(10, 21, 24);
  },
  folder(b) {
    b.rect(1, 9, 30, 27);
    b.hline(2, 11, 7);
    b.set(1, 8);
    b.set(12, 8);
    b.hline(2, 29, 11);
  },
  bomb(b) {
    b.disc(14, 19, 10);
    b.fill(8, 14, 9, 16, 0);
    b.fill(10, 12, 11, 13, 0);
    b.fill(19, 9, 23, 12);
    b.line(22, 8, 24, 5);
    b.line(24, 5, 27, 4);
    b.line(29, 0, 29, 1);
    b.line(30, 3, 31, 3);
    b.line(29, 5, 30, 6);
    b.set(27, 1);
  },
};

const iconCache = new Map();
function iconBitmaps(name) {
  if (!Object.hasOwn(ICONS, name)) throw new Error(`Unknown icon kind "${name}"`);
  if (!iconCache.has(name)) {
    const ink = new Bitmap(32, 32);
    ICONS[name](ink);
    iconCache.set(name, { ink, mask: ink.mask() });
  }
  return iconCache.get(name);
}

// Returns { normal, selected, outline } canvases for an icon.
export function icon(name) {
  const { ink, mask } = iconBitmaps(name);
  return {
    normal: paint(32, 32, [[mask, '#fff'], [ink, '#000']]),
    selected: paint(32, 32, [[mask, '#000'], [ink, '#fff']]),
    outline: paint(32, 32, [[checker(mask.edge()), '#000']]),
    opened: paint(32, 32, [[mask, '#fff'], [checker(mask), '#000'], [mask.edge(), '#000']]),
  };
}

// --- Push buttons ---

export function button(label, w, h, { isDefault = false, pressed = false } = {}) {
  const pad = isDefault ? 4 : 0;
  const W = w + pad * 2, H = h + pad * 2;
  const body = new Bitmap(W, H);
  body.roundRect(pad, pad, pad + w - 1, pad + h - 1, 6);
  const layers = [];
  if (isDefault) {
    const ring = new Bitmap(W, H);
    ring.roundRect(0, 0, W - 1, H - 1, 10);
    const inner = new Bitmap(W, H);
    inner.roundRect(3, 3, W - 4, H - 4, 7);
    layers.push([ring.minus(inner), '#000']);
  }
  layers.push([body, pressed ? '#000' : '#fff']);
  layers.push([body.edge(), '#000']);
  const c = paint(W, H, layers);
  const text = render(label, 'system', pressed ? '#fff' : '#000');
  const ctx = c.getContext('2d');
  ctx.drawImage(text, Math.floor((W - text.width) / 2), pad + Math.floor((h - 16) / 2) + 1);
  return c;
}

// --- Title bar close and zoom boxes (11x11) ---

export function titleBox(kind, pressed) {
  const b = new Bitmap(11, 11);
  b.rect(0, 0, 10, 10);
  if (kind === 'zoom') b.rect(0, 0, 6, 6);
  if (pressed) {
    if (kind === 'zoom') b.fill(1, 1, 9, 9);
    else for (const [x, y] of [[5, 2], [5, 3], [5, 7], [5, 8], [2, 5], [3, 5], [7, 5], [8, 5],
      [2, 2], [3, 3], [7, 7], [8, 8], [2, 8], [3, 7], [7, 3], [8, 2]]) b.set(x, y);
  }
  const bg = new Bitmap(11, 11);
  bg.fill(0, 0, 10, 10);
  return paint(11, 11, [[bg, '#fff'], [b, '#000']]);
}

// --- Scroll bar parts (15x15) ---

function arrowBitmap() {
  const b = new Bitmap(15, 15);
  for (let i = 0; i < 6; i++) b.hline(7 - i, 7 + i, 3 + i);
  b.fill(5, 9, 9, 12);
  return b;
}

export function arrow(dir, filled) {
  let shape = arrowBitmap();
  if (dir === 'down') shape = shape.flipY();
  if (dir === 'left') shape = shape.transpose();
  if (dir === 'right') shape = shape.transpose().flipX();
  return paint(15, 15, [[shape, filled ? '#000' : '#fff'], [shape.edge(), '#000']]);
}

export function growBox() {
  const b = new Bitmap(15, 15);
  b.rect(5, 5, 12, 12);
  b.fill(2, 2, 8, 8, 0);
  b.rect(2, 2, 8, 8);
  return paint(15, 15, [[b, '#000']]);
}

// --- Screen corners (5x5, black outside a quarter circle) ---

export function corner() {
  const b = new Bitmap(5, 5);
  for (let y = 0; y < 5; y++)
    for (let x = 0; x < 5; x++)
      if ((x + 0.5 - 5) ** 2 + (y + 0.5 - 5) ** 2 > 25) b.set(x, y);
  return paint(5, 5, [[b, '#000']]);
}

// --- Arrow cursor ---

const CURSOR = [
  '#', '##', '###', '####', '#####', '######', '#######', '########',
  '#####', '##.##', '#...##', '....##', '.....##', '.....##',
];

export function cursorURL(scale) {
  const ink = new Bitmap(12, 16);
  CURSOR.forEach((row, y) => [...row].forEach((ch, x) => ch === '#' && ink.set(x + 1, y + 1)));
  const halo = ink.dilate().minus(ink);
  return paint(12, 16, [[halo, '#fff'], [ink, '#000']], scale).toDataURL();
}


