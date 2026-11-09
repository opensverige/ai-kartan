// Tester för figurerna under Tar uppdrag: listan, filerna och reserven när inget är valt.
//   npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { FIGURER, figurFor, figurMedId, figurSrc } from './figurer.ts';

test('varje figur har ett id i funktionens form och en fil', () => {
  assert.equal(FIGURER.length, 16);
  FIGURER.forEach((f, i) => {
    assert.equal(f.id, `f${String(i + 1).padStart(2, '0')}`);
    assert.match(f.farg, /^#[0-9a-f]{6}$/);
    assert.ok(existsSync(new URL(`../../public/figurer/${f.id}.svg`, import.meta.url)), f.id);
  });
});

test('ingen figurfil laddar skript eller något utifrån', async () => {
  const { readFileSync } = await import('node:fs');
  for (const f of FIGURER) {
    const svg = readFileSync(new URL(`../../public/figurer/${f.id}.svg`, import.meta.url), 'utf8');
    assert.doesNotMatch(svg, /<script|on[a-z]+=|javascript:|<image|<foreignObject|xlink:href="http|href="http/i, f.id);
  }
});

test('ett valt id används, ett okänt ger en figur ur listan', () => {
  assert.equal(figurFor({ figur: 'f07', slug: 'kim-exempel-ab12' }).id, 'f07');
  for (const okant of ['f99', '../f01', 'f01.svg', '', null, undefined]) {
    const f = figurFor({ figur: okant, slug: 'kim-exempel-ab12' });
    assert.ok(figurMedId(f.id), String(okant));
  }
});

test('reserven är densamma varje gång och sprids över listan', () => {
  assert.equal(figurFor({ slug: 'kim-exempel-ab12' }).id, figurFor({ slug: 'kim-exempel-ab12' }).id);
  const anvanda = new Set(Array.from({ length: 200 }, (_, i) => figurFor({ slug: `medlem-${i}` }).id));
  assert.ok(anvanda.size >= 12, `bara ${anvanda.size} olika`);
});

test('sökvägen följer sajtens bas', () => {
  const f = FIGURER[0];
  assert.equal(figurSrc(f), '/figurer/f01.svg');
  assert.equal(figurSrc(f, '/karta/'), '/karta/figurer/f01.svg');
  assert.equal(figurSrc(f, '/karta'), '/karta/figurer/f01.svg');
});
