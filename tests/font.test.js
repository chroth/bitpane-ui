import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FONTS, measure } from '../dist/font.js';

const PRINTABLE = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i));
const LATIN_LETTERS = [...Array.from({ length: 0x180 - 0xc0 }, (_, i) => String.fromCodePoint(0xc0 + i)), ...'ȘșȚț']
  .filter((ch) => /\p{L}/u.test(ch));

for (const [name, font] of Object.entries(FONTS)) {
  test(`${name} font: every glyph is rectangular and fits the line`, () => {
    for (const [ch, g] of font.glyphs) {
      for (const row of g.rows) assert.equal(row.length, g.w, `${JSON.stringify(ch)} has a row of the wrong width`);
      assert.ok(font.top + g.y >= 0, `${JSON.stringify(ch)} starts above the line`);
      assert.ok(font.top + g.y + g.rows.length <= font.lineHeight, `${JSON.stringify(ch)} ends below the line`);
    }
  });

  test(`${name} font: has all printable ASCII, every Latin-1 and Latin Extended-A letter, and ¡ ¿ « » € £ °`, () => {
    for (const ch of [...PRINTABLE, ...LATIN_LETTERS, ...'¡¿«»€£°']) assert.ok(font.glyphs.has(ch), `missing ${JSON.stringify(ch)}`);
  });
}

test('measure adds glyph widths with one pixel between glyphs', () => {
  const I = FONTS.system.glyphs.get('I');
  assert.equal(measure('', 'system'), 0);
  assert.equal(measure('I', 'system'), I.w);
  assert.equal(measure('II', 'system'), I.w * 2 + 1);
});

test('accented letters are their letter with the accent above or below', () => {
  const { glyphs } = FONTS.system;
  const e = glyphs.get('e'), é = glyphs.get('é'), ç = glyphs.get('ç');
  assert.deepEqual(é.rows.slice(-e.rows.length), e.rows);
  assert.equal(é.y, e.y - 3);
  assert.deepEqual(ç.rows.slice(0, glyphs.get('c').rows.length), glyphs.get('c').rows);
  assert.deepEqual(glyphs.get('í').rows, ['..##', '.##.', '....', ...Array(7).fill('.##.')], 'í is not drawn on a dotless i');
  assert.equal(measure('Café', 'system'), measure('Cafe', 'system'));
});

test('unknown characters measure like a question mark', () => {
  assert.equal(measure('☃', 'small'), measure('?', 'small'));
});
