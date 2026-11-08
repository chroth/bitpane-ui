import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

test('npm pack ships only the compiled library, stylesheet, docs and license', () => {
  const [packed] = JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--json'], { encoding: 'utf8' }));
  const files = packed.files.map((f) => f.path).sort();
  for (const f of files) assert.match(f, /^(dist\/\w+\.(js|d\.ts)|src\/bitpane\.css|README\.md|LICENSE|package\.json)$/, `unexpected file ${f}`);
  for (const f of ['dist/index.js', 'dist/index.d.ts', 'src/bitpane.css', 'LICENSE']) assert.ok(files.includes(f), `${f} is not packed`);
});

test('package exports point at existing files', () => {
  assert.ok(existsSync(pkg.exports['.'].import));
  assert.ok(existsSync(pkg.exports['.'].types));
  assert.ok(existsSync(pkg.exports['./style.css']));
});

test('importing touches no page: it works without a DOM', async () => {
  assert.equal(globalThis.document, undefined);
  const ui = await import('../dist/index.js');
  assert.ok(Object.keys(ui).length > 0);
});
