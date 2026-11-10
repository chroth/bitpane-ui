import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

// Whole classes of bugs stay out by construction: the library never turns
// strings into HTML or code, never talks to the network, and never reads or
// writes storage or cookies. Any of these appearing in src/ fails the build.
const FORBIDDEN = {
  'HTML injection': /\b(innerHTML|outerHTML|insertAdjacentHTML|srcdoc|createContextualFragment|DOMParser)\b|document\.write/,
  'code from strings': /\beval\s*\(|\bnew\s+Function\b|set(Timeout|Interval)\s*\(\s*['"`]|\bimport\s*\(/,
  'network access': /\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|RTCPeerConnection)\b/,
  'storage and cookies': /\b(localStorage|sessionStorage|indexedDB|document\.cookie|caches)\b/,
  'cross-window messaging': /\b(postMessage|BroadcastChannel|window\.open(er)?)\b/,
  'attributes that run code or style': /setAttribute\(\s*['"`](on\w+|style|href|src|srcset|formaction)['"`]/,
  'links or HTML set through Object.assign': /Object\.assign\([^)]*\b(href|src|srcset|srcdoc|innerHTML|outerHTML|action|formAction)\b/,
};

const files = readdirSync('src').filter((f) => f.endsWith('.ts'));

for (const [risk, pattern] of Object.entries(FORBIDDEN)) {
  test(`src/ has no ${risk}`, () => {
    for (const file of files) {
      readFileSync(`src/${file}`, 'utf8').split('\n').forEach((line, i) => {
        const code = line.replace(/\/\/.*$/, '');
        assert.ok(!pattern.test(code), `${file}:${i + 1}: ${line.trim()}`);
      });
    }
  });
}

// Every place that sets a link or navigates checks the URL first (see check.href).
test('every link a library function creates goes through check.href', () => {
  for (const file of files) {
    const src = readFileSync(`src/${file}`, 'utf8');
    const sets = (src.match(/\.href\s*=(?!=)|\blocation\s*=(?!=)|\blocation\.(assign|replace)\(|\.(action|formAction)\s*=(?!=)/g) || []).length;
    if (sets) assert.ok((src.match(/check\.href\(/g) || []).length >= 1, `${file} sets a link without check.href`);
  }
});

// Pictures are the only thing loaded from a URL; images cannot run script.
test('only the picture window sets a src', () => {
  for (const file of files) {
    const sets = /\.(src|srcset)\s*=(?!=)/.test(readFileSync(`src/${file}`, 'utf8'));
    assert.equal(sets, file === 'documents.ts', `${file}: unexpected src`);
  }
});
