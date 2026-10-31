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

  test('unknown item kinds and font names fail with a clear error', async () => {
    const page = await open('desktop');
    const errors = await page.evaluate(() => ['nope', '__proto__', 'constructor', 'trashFull', 'hd'].map((kind) => {
      try { t.desktop.folderWindow('X', [{ label: 'X', kind, opens: t.readme }]); return 'no error'; } catch (e) { return e.message; }
    }));
    assert.deepEqual(errors, ['nope', '__proto__', 'constructor', 'trashFull', 'hd'].map((k) => `Unknown item kind "${k}"`));
    assert.equal(await page.evaluate(() => t.readme.opener.label), 'Readme', 'a failed icon still changed state');
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
      Object.assign(t.projects.rect, { x: a.x + a.w - t.projects.rect.w - 80, y: a.y + a.h - t.projects.rect.h - 70 });
      t.projects.layout();
    });
    await drag(page, icon(page, 'Readme').locator('.img'), win(page, 'Projects').locator('.content > div.icon.win'));
    assert.equal(await icon(page, 'Readme').evaluate((e) => e.closest('.win[aria-label]').getAttribute('aria-label')), 'Projects');
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
    await page.evaluate(() => t.removeMenu());
    assert.equal(await page.locator('.menu-bar').count(), 0);
    assert.deepEqual(await page.evaluate(() => t.area()), before);
    await close(page);
  });

  test('alert() blocks the screen; a link button is a plain link', async () => {
    const page = await open('linkAlert');
    await page.waitForSelector('.dlg');
    const behind = await center(win(page, 'Behind').locator('.tb'));
    assert.equal(await page.evaluate(({ x, y }) => !!document.elementFromPoint(x, y).closest('.modal'), behind), true);
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
    assert.equal(await page.locator('.modal').count(), 0);
    await close(page);
    page = await open('actionAlert');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => t.choice === 'save');
    assert.equal(await page.locator('.modal').count(), 0);
    await close(page);
  });

});
