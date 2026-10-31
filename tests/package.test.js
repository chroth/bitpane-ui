import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

test('npm pack ships only the library, docs and license', () => {
  const [packed] = JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--json'], { encoding: 'utf8' }));
  const files = packed.files.map((f) => f.path).sort();
  for (const f of files) assert.match(f, /^(src\/[\w-]+\.(js|css)|index\.d\.ts|README\.md|LICENSE|package\.json)$/, `unexpected file ${f}`);
  for (const f of ['src/index.js', 'src/bitpane.css', 'index.d.ts', 'LICENSE']) assert.ok(files.includes(f), `${f} is not packed`);
});

test('package exports point at existing files', () => {
  assert.ok(existsSync(pkg.exports['.'].import));
  assert.ok(existsSync(pkg.exports['.'].types));
  assert.ok(existsSync(pkg.exports['./style.css']));
});

test('importing touches no page: it works without a DOM', async () => {
  assert.equal(globalThis.document, undefined);
  const ui = await import('../src/index.js');
  assert.ok(Object.keys(ui).length > 0);
});

test('the type definitions declare exactly the runtime exports', async () => {
  const ui = await import('../src/index.js');
  const declared = [...readFileSync('index.d.ts', 'utf8').matchAll(/^export (?:class|function) (\w+)/gm)].map((m) => m[1]);
  assert.deepEqual(declared.sort(), Object.keys(ui).sort());
});
