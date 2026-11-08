import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as check from '../dist/check.js';

const href = (h, allow) => check.href({ href: h, dangerouslyAllowSchemes: allow }, 'href');

test('links accept http(s), mailto and relative URLs', () => {
  for (const h of ['https://example.com/', 'HTTP://example.com', 'mailto:a@example.com', '/games', 'about', '#top', '?q=1', '//example.com/x', '']) {
    assert.equal(href(h), h);
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
  for (const [h, scheme] of Object.entries(unsafe)) {
    assert.throws(() => href(h), new RegExp(`unsafe URL scheme "${scheme}"`), JSON.stringify(h));
  }
});

test('dangerouslyAllowSchemes allows exactly the listed schemes', () => {
  assert.equal(href('javascript:void 0', ['javascript:']), 'javascript:void 0');
  assert.throws(() => href('data:,x', ['javascript:']), /unsafe URL scheme "data:"/);
  for (const bad of ['JavaScript:', 'javascript', 'java script:']) {
    assert.throws(() => href('/x', [bad]), /dangerouslyAllowSchemes entries/);
  }
});

test('text length and pixel values are checked', () => {
  assert.equal(check.text('x'.repeat(500), 'Label').length, 500);
  assert.throws(() => check.text('x'.repeat(501), 'Label'), /longer than 500/);
  for (const bad of [NaN, Infinity, 20000]) assert.throws(() => check.pixels(bad, 'n'), /must be a number/);
  assert.throws(() => check.pixels(0, 'w', 1), /from 1 to/);
  assert.equal(check.pixels(-5, 'x'), -5);
});
