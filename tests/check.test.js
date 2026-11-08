import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as check from '../src/check.js';

test('links accept http(s), mailto and relative URLs', () => {
  for (const href of ['https://example.com/', 'HTTP://example.com', 'mailto:a@example.com', '/games', 'about', '#top', '?q=1', '//example.com/x', '']) {
    assert.equal(check.url(href, 'href'), href);
  }
});

test('links reject other schemes, however disguised', () => {
  const unsafe = {
    'javascript:alert(1)': 'javascript:',
    ' JaVaScRiPt:alert(1)': 'javascript:',
    'java\tscript:alert(1)': 'javascript:',
    'java\nscript:alert(1)': 'javascript:',
    '\u0001javascript:alert(1)': 'javascript:',
    'data:text/html,<script>alert(1)</script>': 'data:',
    'vbscript:msgbox(1)': 'vbscript:',
    'file:///etc/passwd': 'file:',
    'blob:https://example.com/x': 'blob:',
  };
  for (const [href, scheme] of Object.entries(unsafe)) {
    assert.throws(() => check.url(href, 'href'), new RegExp(`unsafe URL scheme "${scheme}"`), JSON.stringify(href));
  }
});

test('dangerouslyAllowSchemes allows exactly the listed schemes', () => {
  assert.equal(check.url('javascript:void 0', 'href', ['javascript:']), 'javascript:void 0');
  assert.throws(() => check.url('data:,x', 'href', ['javascript:']), /unsafe URL scheme "data:"/);
  for (const bad of ['JavaScript:', 'javascript', 7, 'java script:']) {
    assert.throws(() => check.url('/x', 'href', [bad]), /dangerouslyAllowSchemes entries/);
  }
  assert.throws(() => check.url('/x', 'href', 'javascript:'), /must be an array/);
});

test('URLs must be strings', () => {
  for (const bad of [undefined, null, 1, {}, ['/']]) assert.throws(() => check.url(bad, 'href'), /must be a string/);
});

test('text, numbers, sizes, rects and callbacks are checked', () => {
  assert.throws(() => check.text(1, 'Label'), /must be a string/);
  assert.throws(() => check.text('', 'Label', { empty: false }), /must not be empty/);
  assert.throws(() => check.text('x'.repeat(501), 'Label'), /longer than 500/);
  for (const bad of [NaN, Infinity, '5', 20000]) assert.throws(() => check.number(bad, 'n'), /must be a number/);
  assert.throws(() => check.size([0, 10], 'size'), /must be a number from 1/);
  assert.throws(() => check.size([10], 'size'), /2 to 2 entries/);
  assert.throws(() => check.rect({ x: 0, y: 0, w: 10 }, 'rect'), /rect\.h must be a number/);
  assert.throws(() => check.fn('alert(1)', 'onPress'), /must be a function/);
  assert.throws(() => check.flag('yes', 'isDefault'), /true or false/);
});
