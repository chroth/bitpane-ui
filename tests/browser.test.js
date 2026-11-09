import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { build } from 'esbuild';
import { chromium } from 'playwright';

// The test page is served under the strictest policy a site is likely to
// use, so any inline script or style in the library shows up as a violation.
const CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; " +
  "base-uri 'none'; form-action 'none'; frame-ancestors 'none'; " +
  "require-trusted-types-for 'script'; trusted-types 'none'";
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABAQAAAAA3bvkkAAAACklEQVR4AWNgAAAAAgABc3UBGAAAAABJRU5ErkJggg==', 'base64');

let browser, server, base, out;
let pixelRequests = 0;

before(async () => {
  out = mkdtempSync(join(tmpdir(), 'bitpane-test-'));
  await build({ entryPoints: ['tests/fixture/app.js'], bundle: true, format: 'esm', outdir: out, logLevel: 'silent' });
  const files = {
    '/': ['text/html', '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><link rel="stylesheet" href="/app.css"><script type="module" src="/app.js"></script>'],
    '/app.js': ['text/javascript', readFileSync(join(out, 'app.js'))],
    '/app.css': ['text/css', readFileSync(join(out, 'app.css'))],
    '/pixel.png': ['image/png', PIXEL],
  };
  server = createServer((req, res) => {
    const path = req.url.split(/[?#]/)[0];
    if (path === '/pixel.png') pixelRequests++;
    const file = files[path];
    res.writeHead(file ? 200 : 404, { 'content-type': file ? file[0] : 'text/plain', 'content-security-policy': CSP });
    res.end(file ? file[1] : 'not found');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  // CHROMIUM_PATH runs the tests on an already installed Chromium.
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
});

after(async () => {
  await browser?.close();
  server?.close();
  rmSync(out, { recursive: true, force: true });
});

// Opens a scene from tests/fixture/app.js and records CSP violations and errors.
async function open(scene, { width = 1440, height = 900, ...options } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, ...options });
  const page = await context.newPage();
  page.problems = [];
  page.on('pageerror', (e) => page.problems.push(e.message));
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      window.__violations = (window.__violations || []).concat(e.violatedDirective);
    });
  });
  await page.goto(`${base}/#${scene}`);
  await page.waitForFunction(() => window.t);
  return page;
}

async function close(page) {
  const violations = await page.evaluate(() => window.__violations || []);
  assert.deepEqual(violations, [], 'CSP violations');
  assert.deepEqual(page.problems, [], 'page errors');
  await page.context().close();
}

const icon = (page, label) => page.locator(`.icon[aria-label="${label}"]`);
const win = (page, title) => page.locator(`.win[aria-label="${title}"]`);
const info = async (page, title) => (await win(page, title).locator('.info .sr-only').allTextContents()).join(' | ');
const kind = (page, label) => icon(page, label).getAttribute('data-kind');
const rect = (page, handle) => page.evaluate((h) => ({ ...t[h].rect }), handle);

async function openIcon(page, label) {
  await icon(page, label).dblclick();
  await page.waitForTimeout(500);
}

async function center(locator) {
  const b = await locator.boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

// Drags with real pointer events from one point (or element) to another.
async function drag(page, from, to) {
  const a = from.x === undefined ? await center(from) : from;
  const b = to.x === undefined ? await center(to) : to;
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(100);
}

// Counts pixels that are not pure black or pure white, in a page with no CSP.
async function grayPixels(png) {
  const decoder = await browser.newPage();
  const n = await decoder.evaluate(async (b64) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = Object.assign(document.createElement('canvas'), { width: img.width, height: img.height });
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let gray = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (!((d[i] === 0 || d[i] === 255) && d[i + 1] === d[i] && d[i + 2] === d[i])) gray++;
    }
    return gray;
  }, png.toString('base64'));
  await decoder.close();
  return n;
}

describe('screen', () => {
  test('renders only pure black and white pixels, at 1x and 2x', async () => {
    for (const [width, height] of [[1440, 900], [800, 600]]) {
      const page = await open('desktop', { width, height });
      await openIcon(page, 'HD');
      await openIcon(page, 'Trash');
      await icon(page, 'Readme').focus();
      await page.keyboard.press('Enter');
      await page.waitForTimeout(500);
      assert.equal(await grayPixels(await page.screenshot()), 0, `gray pixels at ${width}x${height}`);
      await close(page);
    }
  });

  test('scales by a whole number to fill the page', async () => {
    for (const [width, height, scale] of [[1440, 900, 2], [1920, 1200, 3], [800, 600, 1]]) {
      const page = await open('window', { width, height });
      const s = await page.evaluate(() => {
        const el = document.getElementById('screen');
        return { w: el.offsetWidth, scale: el.getBoundingClientRect().width / el.offsetWidth };
      });
      assert.equal(s.scale, scale);
      assert.equal(s.w, Math.floor(width / scale));
      await close(page);
    }
  });

  test('area() works before anything is shown', async () => {
    const page = await open('menu');
    const before = await page.evaluate(() => t.areaBefore);
    assert.ok(before.w > 0 && before.h > 0, JSON.stringify(before));
    await close(page);
  });

  test('onResize reports changes to area()', async () => {
    const page = await open('window');
    const before = await page.evaluate(() => t.area());
    await page.setViewportSize({ width: 1300, height: 820 });
    await page.waitForTimeout(400);
    const after = await page.evaluate(() => ({ area: t.area(), resizes: t.resizes }));
    assert.ok(after.resizes > 0);
    assert.notDeepEqual(after.area, before);
    await close(page);
  });
});

describe('windows', () => {
  test('show() opens the window with its content', async () => {
    const page = await open('window');
    assert.equal(await win(page, 'Notes').count(), 1);
    assert.equal(await win(page, 'Notes').locator('.content .sr-only').first().textContent(), 'Hello');
    await close(page);
  });

  test('onShow and onHide are called when the window opens and closes', async () => {
    const page = await open('window');
    await page.waitForFunction(() => t.shown === 1);
    await win(page, 'Notes').locator('.close').click();
    assert.deepEqual(await page.evaluate(() => [t.shown, t.hidden]), [1, 1]);
    await page.evaluate(() => t.notes.show());
    assert.deepEqual(await page.evaluate(() => [t.shown, t.hidden]), [2, 1]);
    await page.evaluate(() => t.notes.show());
    assert.equal(await page.evaluate(() => t.shown), 2, 'showing an open window counted again');
    await close(page);
  });

  test('a window may have no title', async () => {
    const page = await open('window');
    const label = await page.evaluate(async () => {
      const w = new t.api.DesktopWindow('', [200, 120]);
      await w.show();
      return w.el.getAttribute('aria-label');
    });
    assert.equal(label, null);
    await close(page);
  });

  test('dragging the title bar moves the window', async () => {
    const page = await open('window');
    const before = await rect(page, 'notes');
    const bar = await win(page, 'Notes').locator('.tb').boundingBox();
    await drag(page, { x: bar.x + 60, y: bar.y + 10 }, { x: bar.x + 160, y: bar.y + 70 });
    const after = await rect(page, 'notes');
    assert.deepEqual([after.x - before.x, after.y - before.y], [50, 30]);
    await close(page);
  });

  test('the close box closes only when released over it', async () => {
    const page = await open('window');
    const box = await center(win(page, 'Notes').locator('.close'));
    await page.mouse.move(box.x, box.y);
    await page.mouse.down();
    await page.mouse.move(box.x + 200, box.y + 100, { steps: 3 });
    await page.mouse.up();
    assert.equal(await win(page, 'Notes').count(), 1, 'closed although released elsewhere');
    await win(page, 'Notes').locator('.close').click();
    assert.equal(await win(page, 'Notes').count(), 0);
    await close(page);
  });

  test('the zoom box fills the visible area and toggles back', async () => {
    const page = await open('window');
    const before = await rect(page, 'notes');
    await win(page, 'Notes').locator('.zoom').click();
    const zoomed = await rect(page, 'notes');
    const a = await page.evaluate(() => t.area());
    assert.ok(zoomed.w > a.w - 20 && zoomed.h > a.h - 20, 'not zoomed to the area');
    await win(page, 'Notes').locator('.zoom').click();
    assert.deepEqual(await rect(page, 'notes'), before);
    await close(page);
  });

  test('the grow box resizes the window', async () => {
    const page = await open('window');
    const before = await rect(page, 'notes');
    await drag(page, win(page, 'Notes').locator('.grow'), await (async () => {
      const g = await center(win(page, 'Notes').locator('.grow'));
      return { x: g.x + 80, y: g.y + 40 };
    })());
    const after = await rect(page, 'notes');
    assert.deepEqual([after.w - before.w, after.h - before.h], [40, 20]);
    await close(page);
  });

  test('windows stay inside the visible area when the page shrinks', async () => {
    const page = await open('window');
    await win(page, 'Notes').locator('.zoom').click();
    await page.setViewportSize({ width: 700, height: 500 });
    await page.waitForTimeout(400);
    const [r, a] = await page.evaluate(() => [t.notes.rect, t.area()]);
    assert.ok(r.x >= a.x && r.y >= a.y && r.x + r.w <= a.x + a.w && r.y + r.h <= a.y + a.h, JSON.stringify({ r, a }));
    await close(page);
  });

  test('hide() stops a window that is still opening; show() again reopens it', async () => {
    const page = await open('desktop');
    const r = await page.evaluate(async () => {
      const w = new t.api.DesktopWindow('Second', [200, 100]);
      w.show(); w.hide();
      t.hd.show(); setTimeout(() => t.hd.hide(), 50);
      await new Promise((done) => setTimeout(done, 600));
      const stopped = [w.el.isConnected, t.hd.el.isConnected];
      w.show(); w.hide(); await w.show();
      return { stopped, reopened: w.el.isConnected };
    });
    assert.deepEqual(r, { stopped: [false, false], reopened: true });
    await close(page);
  });

  test('setRect() moves and resizes at once; rect is a copy', async () => {
    const page = await open('window');
    const box = await page.evaluate(() => {
      t.notes.rect.x = 9999;
      t.notes.setRect({ x: 30, y: 40, w: 200, h: 150 });
      const b = document.querySelector('.win[aria-label="Notes"]').getBoundingClientRect();
      const s = b.width / 200;
      return [t.notes.rect, Math.round(b.height / s)];
    });
    assert.deepEqual(box, [{ x: 30, y: 40, w: 200, h: 150 }, 150]);
    await close(page);
  });

  test('scroll bars follow the content without being told', async () => {
    const page = await open('window');
    const notes = win(page, 'Notes');
    assert.equal(await notes.evaluate((e) => e.classList.contains('sv')), false);
    await page.evaluate(() => {
      const tall = document.createElement('div');
      tall.style.height = '1000px';
      t.notes.content.append(tall);
    });
    await page.waitForFunction(() => document.querySelector('.win[aria-label="Notes"]').classList.contains('sv'));
    await page.evaluate(() => t.notes.content.lastChild.remove());
    await page.waitForFunction(() => !document.querySelector('.win[aria-label="Notes"]').classList.contains('sv'));
    await close(page);
  });

  test('a second finger does not move or end a drag', async () => {
    const page = await open('window', { hasTouch: true });
    const box = await win(page, 'Notes').locator('.ttl').boundingBox();
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    const cdp = await page.context().newCDPSession(page);
    const touch = (type, touchPoints) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
    const first = (d) => ({ x: x + d, y: y + d, id: 1 });
    await touch('touchStart', [first(0)]);
    await touch('touchMove', [first(10)]);
    await touch('touchStart', [first(10), { x: 1200, y: 800, id: 2 }]);
    await touch('touchMove', [first(20), { x: 1300, y: 850, id: 2 }]);
    await touch('touchEnd', [{ x: 1300, y: 850, id: 2 }]); // lists the finger lifted
    await touch('touchMove', [first(40)]);
    await touch('touchEnd', [first(40)]);
    await page.waitForTimeout(200);
    const scale = await page.evaluate(() => document.querySelector('.win').getBoundingClientRect().width / t.notes.rect.w);
    assert.deepEqual(await page.evaluate(() => t.notes.rect), { x: 24 + 40 / scale, y: 30 + 40 / scale, w: 240, h: 160 });
    await close(page);
  });

  test('a zoomed window keeps filling the screen as it grows', async () => {
    const page = await open('window', { width: 700, height: 450 });
    await win(page, 'Notes').locator('.zoom').click();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(500);
    const [r, a] = await page.evaluate(() => [t.notes.rect, t.area()]);
    assert.deepEqual(r, { x: a.x + 4, y: a.y + 4, w: a.w - 10, h: a.h - 10 });
    await close(page);
  });

  test('content scrolls by wheel, keys, thumb and track, without native scroll bars', async () => {
    const page = await open('window');
    await page.evaluate(() => {
      const tall = document.createElement('div');
      tall.style.cssText = 'position: absolute; top: 0; left: 0; width: 10px; height: 2000px';
      t.notes.content.append(tall);
    });
    const top = () => page.evaluate(() => t.notes.content.scrollTop);
    const content = await center(win(page, 'Notes').locator('.content'));
    await page.mouse.move(content.x, content.y);
    await page.mouse.wheel(0, 300);
    await page.waitForFunction(() => t.notes.content.scrollTop === 300);
    assert.equal(await page.evaluate(() => t.notes.content.offsetWidth - t.notes.content.clientWidth), 0, 'a native scroll bar shows');
    await win(page, 'Notes').focus();
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowDown');
    assert.equal(await top(), 16);
    await page.keyboard.press('End');
    assert.equal(await top(), await page.evaluate(() => t.notes.content.scrollHeight - t.notes.content.clientHeight));
    await page.keyboard.press('Home');
    const atTop = () => page.waitForFunction(() => t.notes.el.querySelector('.vs .thumb').style.top === '15px');
    await atTop();
    const thumb = await center(win(page, 'Notes').locator('.vs .thumb'));
    await drag(page, thumb, { x: thumb.x, y: thumb.y + 60 });
    assert.ok(await top() > 500, 'dragging the thumb did not scroll');
    await page.keyboard.press('Home');
    await atTop();
    const bar = await win(page, 'Notes').locator('.vs').boundingBox();
    await page.mouse.click(bar.x + bar.width / 2, bar.y + bar.height - 40);
    assert.equal(await top(), await page.evaluate(() => t.notes.content.clientHeight - 16), 'clicking the track did not page down');
    await close(page);
  });

  test('touch pans content only when it can scroll, and icons still drag', async () => {
    let page = await open('window', { hasTouch: true });
    const cdp = await page.context().newCDPSession(page);
    const swipe = async ({ x, y }, dx, dy) => {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      for (let i = 1; i <= 10; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + (dx * i) / 10, y: y + (dy * i) / 10 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(200);
    };
    await page.evaluate(() => { t.cancels = 0; t.notes.content.addEventListener('pointercancel', () => t.cancels++); });
    const at = await center(win(page, 'Notes').locator('.content'));
    await swipe(at, 0, -150);
    assert.equal(await page.evaluate(() => t.cancels), 0, 'content that cannot scroll lost its touch');
    await page.evaluate(() => {
      const tall = document.createElement('div');
      tall.style.cssText = 'position: absolute; top: 0; left: 0; width: 10px; height: 2000px';
      t.notes.content.append(tall);
    });
    await swipe(at, 0, -150);
    assert.ok(await page.evaluate(() => t.notes.content.scrollTop) > 50, 'scrollable content did not pan');
    await close(page);

    page = await open('desktop', { hasTouch: true });
    const cdp2 = await page.context().newCDPSession(page);
    await openIcon(page, 'HD');
    await page.evaluate(() => {
      const tall = document.createElement('div');
      tall.style.cssText = 'position: absolute; top: 0; left: 0; width: 10px; height: 2000px';
      t.hd.content.append(tall);
    });
    const from = await center(icon(page, 'Readme').locator('.img'));
    const to = { x: 200, y: 700 };
    await cdp2.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] });
    for (let i = 1; i <= 10; i++) await cdp2.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x + ((to.x - from.x) * i) / 10, y: from.y + ((to.y - from.y) * i) / 10 }] });
    await cdp2.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(200);
    assert.equal(await icon(page, 'Readme').evaluate((e) => e.closest('.win[aria-label]')), null, 'the icon did not drag out to the desktop');
    await close(page);
  });

  test('close boxes have finger-sized touch targets on touch screens', async () => {
    const page = await open('window', { width: 390, height: 664, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
    const box = await center(win(page, 'Notes').locator('.close'));
    await page.touchscreen.tap(box.x + 30, box.y);
    assert.equal(await win(page, 'Notes').count(), 1, 'closed by a tap far away');
    await page.touchscreen.tap(box.x + 12, box.y + 12);
    await page.waitForTimeout(300);
    assert.equal(await win(page, 'Notes').count(), 0, 'a near tap did not close');
    await close(page);
  });
});

describe('desktop', () => {
  test('the disk sits top right and the Trash bottom right', async () => {
    const page = await open('desktop');
    const a = await page.evaluate(() => t.area());
    const [disk, trash] = await Promise.all(['HD', 'Trash'].map((l) => icon(page, l).evaluate((e) => ({ x: e.offsetLeft, y: e.offsetTop }))));
    assert.ok(disk.x > a.x + a.w - 80 && disk.y < a.y + 40, JSON.stringify(disk));
    assert.ok(trash.x > a.x + a.w - 80 && trash.y > a.y + a.h - 80, JSON.stringify(trash));
    await close(page);
  });

  test('double-click opens; info bars count items and add up disk space', async () => {
    const page = await open('desktop');
    await openIcon(page, 'HD');
    await openIcon(page, 'Trash');
    // Readme 3K + Projects 0K on the disk, Photo 7K in the Trash, 1000K disk.
    assert.equal(await info(page, 'HD'), '2 items | 10K in disk | 990K available');
    assert.equal(await info(page, 'Trash'), '1 item | 10K in disk | 990K available');
    await close(page);
  });

  test('wording and labels can be replaced', async () => {
    const page = await open('swedish');
    await openIcon(page, 'HD');
    assert.equal(await info(page, 'HD'), '0 objekt | 0K på disken | 1,000K ledigt');
    assert.equal(await icon(page, 'Papperskorg').count(), 1);
    assert.equal(await win(page, 'HD').locator('.close').getAttribute('aria-label'), 'Stäng');
    assert.equal(await win(page, 'HD').locator('.zoom').getAttribute('aria-label'), 'Zooma');
    await close(page);
  });

  test('icons open with the keyboard', async () => {
    const page = await open('desktop');
    await icon(page, 'HD').focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
    assert.equal(await win(page, 'HD').count(), 1);
    await close(page);
  });

  test('dragging icons moves them between folders, the Trash and the desktop', async () => {
    const page = await open('desktop');
    assert.equal(await kind(page, 'Trash'), 'trashFull');
    await openIcon(page, 'HD');
    await drag(page, icon(page, 'Readme').locator('.img'), icon(page, 'Trash').locator('.img'));
    assert.equal(await info(page, 'HD'), '1 item | 10K in disk | 990K available');
    await openIcon(page, 'Trash');
    assert.equal(await info(page, 'Trash'), '2 items | 10K in disk | 990K available');
    for (const label of ['Readme', 'Photo']) await drag(page, icon(page, label).locator('.img'), { x: 120, y: 820 });
    assert.equal(await kind(page, 'Trash'), 'trash');
    assert.equal(await info(page, 'Trash'), '0 items | 10K in disk | 990K available');
    await close(page);
  });

  test('the disk cannot go in the Trash, nor a folder inside itself', async () => {
    const page = await open('desktop');
    await drag(page, icon(page, 'HD').locator('.img'), icon(page, 'Trash').locator('.img'));
    assert.equal(await icon(page, 'HD').evaluate((e) => e.parentElement.id), 'screen');
    await openIcon(page, 'HD');
    await icon(page, 'Projects').focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
    await drag(page, icon(page, 'Projects').locator('.img'), win(page, 'Projects').locator('.content'));
    assert.equal(await icon(page, 'Projects').evaluate((e) => e.closest('.win').getAttribute('aria-label')), 'HD');
    await close(page);
  });

  test('unknown icon kinds and font names fail with a clear error', async () => {
    const page = await open('desktop');
    const errors = await page.evaluate(() => ['nope', '__proto__', 'constructor'].map((kind) => {
      try { t.desktop.folderWindow('X', [{ label: 'X', kind, opens: t.readme }]); return 'no error'; } catch (e) { return e.message; }
    }));
    assert.deepEqual(errors, ['nope', '__proto__', 'constructor'].map((k) => `Unknown icon kind "${k}"`));
    assert.equal(await page.evaluate(() => t.readme.opener.el.getAttribute('aria-label')), 'Readme', 'a failed icon still changed state');
    const fonts = await page.evaluate(() => ['nope', '__proto__'].map((f) => {
      try { t.bitmapText('x', f); return 'no error'; } catch (e) { return e.message; }
    }));
    assert.deepEqual(fonts, ['Unknown font "nope"', 'Unknown font "__proto__"']);
    await close(page);
  });

  test("consumer elements sharing the library's class names don't break drag and drop", async () => {
    const page = await open('desktop');
    await openIcon(page, 'HD');
    await icon(page, 'Projects').focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      const a = t.area();
      const r = t.projects.rect;
      t.projects.setRect({ x: a.x + a.w - r.w - 80, y: a.y + a.h - r.h - 70 });
    });
    await drag(page, icon(page, 'Readme').locator('.img'), win(page, 'Projects').locator('.content > div.icon.win'));
    assert.equal(await icon(page, 'Readme').evaluate((e) => e.closest('.win[aria-label]').getAttribute('aria-label')), 'Projects');
    await close(page);
  });

  test('applications are links: a double-click or Enter launches, a click selects', async () => {
    let page = await open('apps');
    await openIcon(page, 'HD');
    const game = icon(page, 'Game');
    assert.equal(await game.evaluate((e) => e.tagName), 'A');
    assert.equal(await game.getAttribute('href'), '#launched');
    await game.click();
    await page.waitForTimeout(600);
    assert.equal(await page.evaluate(() => location.hash), '#apps', 'a single click navigated');
    assert.match(await game.getAttribute('class'), /selected/);
    await game.dblclick();
    await page.waitForFunction(() => location.hash === '#launched');
    await close(page);

    page = await open('apps');
    await openIcon(page, 'HD');
    await icon(page, 'Tool').focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => location.hash === '#tool');
    await close(page);
  });

  test('modified clicks on applications are left to the browser', async () => {
    const page = await open('apps');
    await openIcon(page, 'HD');
    const [tab] = await Promise.all([page.context().waitForEvent('page'), icon(page, 'Game').click({ modifiers: ['Control'] })]);
    await tab.waitForLoadState();
    assert.match(tab.url(), /#launched$/);
    assert.equal(await page.evaluate(() => location.hash), '#apps');
    await tab.close();
    await close(page);
  });

  test('modified Enter on applications is left to the browser', async () => {
    const page = await open('apps');
    await openIcon(page, 'HD');
    await icon(page, 'Game').focus();
    const [tab] = await Promise.all([page.context().waitForEvent('page'), page.keyboard.press('Control+Enter')]);
    await tab.waitForLoadState();
    assert.match(tab.url(), /#launched$/);
    await page.waitForTimeout(600);
    assert.equal(await page.evaluate(() => location.hash), '#apps');
    await tab.close();
    await close(page);
  });

  test('focus moves into a window that opens and back to its icon when it closes', async () => {
    const page = await open('desktop');
    await icon(page, 'HD').focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'HD');
    assert.equal(await page.evaluate(() => document.activeElement.classList.contains('win')), true, 'focus is not on the window');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => !!document.activeElement.closest('.win[aria-label=HD]')), true, 'Tab left the window');
    await win(page, 'HD').locator('.close').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => document.activeElement === document.querySelector('.icon[aria-label=HD]')), true);
    await close(page);
  });

  test('custom icon art is drawn, and bad art is rejected', async () => {
    const page = await open('apps');
    await openIcon(page, 'HD');
    // The 4x4 art is centred in the 32x32 icon: pixel (15, 15) is ink; corner (14, 14) is outside the shape.
    const pixels = await icon(page, 'Game').locator('.img canvas').first().evaluate((c) => {
      const ctx = c.getContext('2d');
      return [ctx.getImageData(15, 15, 1, 1).data.join(), ctx.getImageData(14, 14, 1, 1).data[3]];
    });
    assert.deepEqual(pixels, ['0,0,0,255', 0]);
    const errors = await page.evaluate(() => [
      [{ label: 'X', kind: 'application', href: '/', art: ['2'] }],
      [{ label: 'X', kind: 'application', href: '/', art: Array(33).fill('1') }],
    ].map((items) => { try { t.desktop.folderWindow('X', items); return 'no error'; } catch (e) { return e.message; } }));
    assert.deepEqual(errors, [
      'Icon art must be up to 32 rows of up to 32 "0" or "1" characters',
      'Icon art must be up to 32 rows of up to 32 "0" or "1" characters',
    ]);
    await close(page);
  });

  test('picture documents load their image only when first opened', async () => {
    const before = pixelRequests;
    const page = await open('desktop');
    await page.waitForTimeout(300);
    assert.equal(pixelRequests, before, 'image loaded before opening');
    await openIcon(page, 'Trash');
    await openIcon(page, 'Photo');
    await page.waitForFunction(() => document.querySelector('.win[aria-label="Photo"] img')?.complete);
    assert.equal(pixelRequests, before + 1);
    assert.equal(await win(page, 'Photo').locator('img').getAttribute('alt'), 'A photo');
    await close(page);
  });

  test('links in text documents open in a new tab without referrer or opener', async () => {
    const page = await open('desktop');
    await openIcon(page, 'HD');
    await icon(page, 'Readme').focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
    const link = win(page, 'Readme').locator('a');
    assert.equal(await link.getAttribute('href'), 'https://example.com/');
    assert.equal(await link.getAttribute('target'), '_blank');
    assert.equal(await link.getAttribute('rel'), 'noopener noreferrer');
    await close(page);
  });
});

describe('controls', () => {
  test('push buttons fire on release over them, by keyboard, and via press()', async () => {
    const page = await open('window');
    const ok = win(page, 'Notes').locator('.btn');
    await ok.click();
    assert.equal(await page.evaluate(() => t.pressed), 1);
    const c = await center(ok);
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    await page.mouse.move(c.x + 150, c.y + 80, { steps: 3 });
    await page.mouse.up();
    assert.equal(await page.evaluate(() => t.pressed), 1, 'fired although released elsewhere');
    await ok.focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => t.pressed), 2);
    await ok.evaluate((b) => b.press());
    await page.waitForFunction(() => t.pressed === 3);
    await close(page);
  });

  test('bitmap text keeps a readable copy for screen readers', async () => {
    const page = await open('window');
    const text = win(page, 'Notes').locator('.content .t').first();
    assert.equal(await text.locator('.sr-only').textContent(), 'Hello');
    assert.equal(await text.locator('canvas').getAttribute('aria-hidden'), 'true');
    await close(page);
  });

  test('menus work with pointer and keyboard, and can be removed', async () => {
    const page = await open('menu');
    const [before, withMenu] = await page.evaluate(() => [t.areaBefore, t.areaWithMenu]);
    assert.equal(withMenu.y - before.y, 22, 'menu bar space not reserved');
    assert.equal(await page.locator('.menu-bar').getAttribute('aria-label'), 'Main menu');
    const file = page.getByRole('button', { name: 'File' });
    await file.click();
    assert.equal(await file.getAttribute('aria-expanded'), 'true');
    assert.equal(await page.evaluate(() => document.activeElement.textContent), 'New');
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Quit', 'disabled item not skipped');
    await page.keyboard.press('Enter');
    assert.deepEqual(await page.evaluate(() => t.menuActions), ['quit']);
    assert.equal(await file.getAttribute('aria-expanded'), 'false');
    await file.click();
    await page.keyboard.press('Escape');
    assert.equal(await file.getAttribute('aria-expanded'), 'false');
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Edit');
    await file.click();
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Undo', 'the next menu did not open');
    await page.keyboard.press('ArrowLeft');
    assert.equal(await page.evaluate(() => document.activeElement.textContent), 'New');
    await page.keyboard.press('Escape');
    await page.evaluate(() => t.removeMenu());
    assert.equal(await page.locator('.menu-bar').count(), 0);
    assert.deepEqual(await page.evaluate(() => t.area()), before);
    await close(page);
  });

  test('alert() blocks the screen; a link button is a plain link', async () => {
    const page = await open('linkAlert');
    await page.waitForSelector('.dlg');
    const behind = await center(win(page, 'Behind').locator('.tb'));
    assert.equal(await page.evaluate(({ x, y }) => !!document.elementFromPoint(x, y).closest('.dlg'), behind), true, 'a click behind the alert reaches the page');
    assert.match(await page.locator('.dlg').innerText(), /Something broke\.[\s\S]*ID = 42/);
    const restart = page.getByRole('link', { name: 'Restart' });
    assert.equal(await restart.getAttribute('href'), '#restarted');
    assert.equal(await page.evaluate(() => document.activeElement === t.alert.buttons[0]), true);
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => location.hash === '#restarted');
    await close(page);
  });

  test('clicking a link button follows its link', async () => {
    const page = await open('linkAlert');
    await page.getByRole('link', { name: 'Restart' }).click();
    await page.waitForFunction(() => location.hash === '#restarted');
    await close(page);
  });

  test('alert() action buttons close the alert; Return presses the last one', async () => {
    let page = await open('actionAlert');
    await page.getByRole('button', { name: 'Discard' }).click();
    assert.equal(await page.evaluate(() => t.choice), 'discard');
    assert.equal(await page.locator('.dlg').count(), 0);
    await close(page);
    page = await open('actionAlert');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => t.choice === 'save');
    assert.equal(await page.locator('.dlg').count(), 0);
    await close(page);
  });


  test('alert keys go to the focused button; Escape presses nothing; actions run once', async () => {
    let page = await open('actionAlert');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.dlg[open]').count(), 1, 'Escape closed the alert');
    for (const key of ['Enter', ' ']) {
      await close(page);
      page = await open('actionAlert');
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press(key);
      await page.waitForTimeout(200);
      assert.equal(await page.evaluate(() => t.choice), 'discard', `${key} on Discard`);
    }
    await close(page);
    page = await open('window');
    await page.evaluate(() => { t.n = 0; t.a = t.api.alert({ message: 'x', buttons: [{ label: 'OK', action: () => t.n++ }] }); });
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await page.evaluate(() => { t.a.buttons[0].press(); t.a.buttons[0].press(); });
    await page.waitForTimeout(400);
    assert.equal(await page.evaluate(() => t.n), 1);
    await close(page);
  });

  test('Return after clicking the alert background presses the default', async () => {
    const page = await open('actionAlert');
    const box = await page.locator('.dlg').boundingBox();
    await page.mouse.click(box.x + 20, box.y + 10);
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => t.choice === 'save');
    await close(page);
  });

  test('modified Enter on an alert link button is left to the browser', async () => {
    const page = await open('linkAlert');
    const [tab] = await Promise.all([page.context().waitForEvent('page'), page.keyboard.press('Control+Enter')]);
    await tab.waitForLoadState();
    assert.match(tab.url(), /#restarted$/);
    assert.equal(await page.evaluate(() => location.hash), '#linkAlert');
    await tab.close();
    await close(page);
  });

  test('closing an alert returns focus to where it was', async () => {
    const page = await open('window');
    await win(page, 'Notes').locator('.btn').focus();
    await page.evaluate(() => t.api.alert({ message: 'x', buttons: [{ label: 'OK' }] }));
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => document.activeElement.textContent), 'OK');
    assert.equal(await page.evaluate(() => !!document.activeElement.closest('.win[aria-label=Notes]')), true);
    await close(page);
  });
});

describe('secure by design', () => {
  test('every link API refuses unsafe URLs unless the call allows them on purpose', async () => {
    const page = await open('apps');
    const results = await page.evaluate(() => {
      const bad = 'javascript:alert(1)';
      const allow = ['javascript:'];
      const attempt = (f) => { try { f(); return 'allowed'; } catch (e) { return e.message; } };
      const rect = { x: 0, y: 0, w: 60, h: 20 };
      const r = {};
      r.textWindow = [attempt(() => t.api.textWindow('X', [{ text: 'x', href: bad }])), attempt(() => t.api.textWindow('X', [{ text: 'x', href: bad, dangerouslyAllowSchemes: allow }]))];
      r.pushButton = [attempt(() => t.api.pushButton(document.body, { label: 'X', rect, href: bad })), attempt(() => t.api.pushButton(document.body, { label: 'X', rect, href: bad, dangerouslyAllowSchemes: allow }).remove())];
      r.alert = [attempt(() => t.api.alert({ message: 'x', buttons: [{ label: 'Go', href: bad }] }))];
      r.alertLeftovers = document.querySelectorAll('.dlg').length;
      r.alert.push(attempt(() => t.api.alert({ message: 'x', buttons: [{ label: 'Go', href: bad, dangerouslyAllowSchemes: allow }] }).close()));
      const app = (extra) => attempt(() => t.desktop.folderWindow('X', [{ label: 'X', kind: 'application', href: bad, ...extra }]));
      r.application = [app(), app({ dangerouslyAllowSchemes: allow })];
      return r;
    });
    const refused = 'uses the unsafe URL scheme "javascript:"; list it in dangerouslyAllowSchemes to allow it on purpose';
    assert.deepEqual(results, {
      textWindow: [`Link href ${refused}`, 'allowed'],
      pushButton: [`Button href ${refused}`, 'allowed'],
      alert: [`Button href ${refused}`, 'allowed'],
      alertLeftovers: 0,
      application: [`Application href ${refused}`, 'allowed'],
    });
    await close(page);
  });

  test('an open alert makes everything else inert, so focus cannot leave it', async () => {
    const page = await open('window');
    await page.evaluate(() => { t.choice = null; t.api.alert({ message: 'Sure?', buttons: [{ label: 'No', action: () => (t.choice = 'no') }, { label: 'Yes', action: () => (t.choice = 'yes') }] }); });
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => !!document.activeElement.closest('.dlg') || document.activeElement === document.body), true, 'focus left the alert');
    }
    const focusable = () => win(page, 'Notes').evaluate((e) => { e.focus(); return document.activeElement === e; });
    assert.equal(await focusable(), false, 'the window behind can take focus');
    await page.getByRole('button', { name: 'No' }).click();
    assert.equal(await page.evaluate(() => [t.choice, document.querySelectorAll('.dlg').length].join()), 'no,0');
    assert.equal(await focusable(), true, 'the window behind stays inert');
    await close(page);
  });

  test('windows opened during an alert are inert too, and nested alerts close in any order', async () => {
    const page = await open('window');
    const r = await page.evaluate(async () => {
      // Inert elements cannot take focus; focus goes back where it was.
      const inert = (e) => { const was = document.activeElement; e.focus(); const yes = document.activeElement !== e; was.focus(); return yes; };
      const notes = document.querySelector('.win[aria-label=Notes]');
      const a = t.api.alert({ message: 'one', buttons: [{ label: 'A' }] });
      const late = new t.api.DesktopWindow('Late', [200, 100]);
      await late.show();
      const lateInert = inert(late.el);
      const lateFocused = late.el.contains(document.activeElement);
      const b = t.api.alert({ message: 'two', buttons: [{ label: 'B' }] });
      a.close();
      const underB = [inert(notes), inert(late.el), inert(document.querySelector('.dlg'))];
      b.close();
      return { lateInert, lateFocused, underB, after: [inert(notes), inert(late.el)] };
    });
    assert.deepEqual(r, { lateInert: true, lateFocused: false, underB: [true, true, false], after: [false, false] });
    await close(page);
  });

  test('pictures load without sending a referrer', async () => {
    const page = await open('desktop');
    assert.equal(await page.evaluate(() => t.photo.content.querySelector('img').referrerPolicy), 'no-referrer');
    await close(page);
  });

  test('bad input fails at once, before anything changes', async () => {
    const page = await open('window');
    const results = await page.evaluate(() => {
      const count = () => document.querySelectorAll('.win, .btn, .menu-bar, .dlg').length;
      const before = count();
      const attempt = (f) => { try { f(); return 'no error'; } catch (e) { return e.message; } };
      const r = [
        attempt(() => new t.api.DesktopWindow('X', [NaN, 100])),
        attempt(() => t.api.pushButton(document.body, { label: 'OK', rect: { x: 0, y: 0, w: 1e9, h: 20 }, action() {} })),
        attempt(() => t.api.bitmapText('x', 'system', 'script')),
        attempt(() => t.api.bitmapText('x'.repeat(501))),
        attempt(() => t.api.alert({ message: 'x', buttons: [] })),
        attempt(() => t.notes.setInfo(['a'])),
      ];
      return { r, changed: count() - before };
    });
    assert.deepEqual(results, {
      r: [
        'Window width must be a number from 1 to 10000',
        'Button width must be a number from 1 to 10000',
        'bitmapText cannot create a <script>',
        'Text is longer than 500 characters',
        'An alert needs at least one button',
        'setInfo needs a window created with info: true',
      ],
      changed: 0,
    });
    await close(page);
  });

  test('bad window, button, text and menu input fails before anything changes', async () => {
    const page = await open('window');
    const results = await page.evaluate(() => {
      const count = () => document.querySelectorAll('.win, .btn, .menu-bar').length;
      const before = { count: count(), rect: t.notes.rect };
      const attempt = (f) => { try { f(); return 'no error'; } catch (e) { return e.message; } };
      const rect = { x: 0, y: 0, w: 60, h: 20 };
      const r = [
        attempt(() => t.notes.setRect({ x: NaN })),
        attempt(() => t.notes.setRect({ w: 0 })),
        attempt(() => t.notes.setRect({ x: 50, foo: 1 })),
        attempt(() => t.api.pushButton(document.body, { label: 'OK', rect: { ...rect, x: NaN }, action() {} })),
        attempt(() => t.api.textWindow('X', ['fine', 'x'.repeat(501)]).show()),
        attempt(() => t.api.menuBar([{ label: 'x'.repeat(501), items: [] }])),
      ];
      const a = t.area();
      a.w = 1;
      return { r, changed: count() - before.count, rectKept: JSON.stringify(t.notes.rect) === JSON.stringify(before.rect), areaKept: t.area().w > 1, menuStillMounts: typeof t.api.menuBar([]) };
    });
    assert.deepEqual(results, {
      r: [
        'Window x must be a number from -10000 to 10000',
        'Window w must be a number from 1 to 10000',
        'setRect takes x, y, w and h, not "foo"',
        'Button x must be a number from -10000 to 10000',
        'Text is longer than 500 characters',
        'Text is longer than 500 characters',
      ],
      changed: 0,
      rectKept: true,
      areaKept: true,
      menuStillMounts: 'function',
    });
    await close(page);
  });

  test('bad desktop items fail before anything changes; a window has one icon, a desktop one disk and Trash', async () => {
    const page = await open('desktop');
    const results = await page.evaluate(() => {
      const icons = () => document.querySelectorAll('.icon').length;
      const before = icons();
      const attempt = (f) => { try { f(); return 'no error'; } catch (e) { return e.message; } };
      const fresh = new t.api.DesktopWindow('Fresh', [100, 100]);
      const doc = (extra) => ({ label: 'Doc', kind: 'document', opens: fresh, ...extra });
      const r = [
        attempt(() => t.desktop.folderWindow('X', [doc(), { label: 'App', kind: 'application' }])),
        attempt(() => t.desktop.folderWindow('X', [doc({ kb: NaN })])),
        attempt(() => t.desktop.folderWindow('X', [doc({ kb: -1 })])),
        attempt(() => t.desktop.folderWindow('X', [doc(), doc()])),
        attempt(() => t.desktop.folderWindow('X', [doc({ opens: t.readme })])),
        attempt(() => t.desktop.folderWindow('X', [doc({ opens: {} })])),
        attempt(() => t.desktop.disk('HD2', t.desktop.folderWindow('Y', []))),
        attempt(() => t.desktop.trash([])),
      ];
      return { r, freshUnclaimed: fresh.opener === null, changed: icons() - before };
    });
    assert.deepEqual(results, {
      r: [
        'Application href is missing',
        'Item kb must be a number of 0 or more',
        'Item kb must be a number of 0 or more',
        'A window can be opened by only one icon',
        'A window can be opened by only one icon',
        'An icon must open a DesktopWindow',
        'A Desktop has only one disk',
        'A Desktop has only one Trash',
      ],
      freshUnclaimed: true,
      changed: 0,
    });
    await close(page);
  });
});
