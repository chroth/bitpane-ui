import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FONTS, measure } from '../src/font.js';

const PRINTABLE = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i));

for (const [name, font] of Object.entries(FONTS)) {
  test(`${name} font: every glyph is rectangular and fits the line`, () => {
    for (const [ch, g] of Object.entries(font.glyphs)) {
      for (const row of g.rows) assert.equal(row.length, g.w, `${JSON.stringify(ch)} has a row of the wrong width`);
      assert.ok(font.top + g.y >= 0, `${JSON.stringify(ch)} starts above the line`);
      assert.ok(font.top + g.y + g.rows.length <= font.lineHeight, `${JSON.stringify(ch)} ends below the line`);
    }
  });

  test(`${name} font: has all printable ASCII plus å ä ö`, () => {
    for (const ch of [...PRINTABLE, ...'åäöÅÄÖ']) assert.ok(font.glyphs[ch], `missing ${JSON.stringify(ch)}`);
  });
}

test('measure adds glyph widths with one pixel between glyphs', () => {
  const { I } = FONTS.system.glyphs;
  assert.equal(measure('', 'system'), 0);
  assert.equal(measure('I', 'system'), I.w);
  assert.equal(measure('II', 'system'), I.w * 2 + 1);
});

test('unknown characters measure like a question mark', () => {
  assert.equal(measure('☃', 'small'), measure('?', 'small'));
});
