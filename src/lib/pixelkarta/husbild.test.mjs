// Tester för utsnittet runt en organisations tända hus.
//   npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import { husutsnitt } from './husbild.ts';

const FIL = {
  version: 1,
  metersPerPixel: 0.25,
  cities: [
    {
      id: 'stockholm',
      label: 'Stockholm',
      map: { id: 'stockholm-norr', dzi: 'stockholm-norr@1.dzi', heading: 0, origin: { lat: 59.3, lon: 18 }, xMeters: 0, yMeters: 0, groundHeight: 0, width: 147456, height: 71680 },
      water: { adm8: [100, 100] },
      addresses: { 'ai-vision-sweden': 'r1' },
      houses: { r1: { picture: 'oar/hus-r1.png', x: 44646, y: 11726, w: 474, h: 354 } },
    },
  ],
};

test('ett tänt hus ger ett utsnitt med huset i mitten', () => {
  const u = husutsnitt(FIL, 'ai-vision-sweden', 'https://bild.test/v1/');
  assert.ok(u);
  assert.equal(u.stad, 'Stockholm');
  // 474 punkter breda hus på en 480 punkter bred ruta: en nivå ner, 237 punkter.
  assert.equal(u.hus.w, 237);
  assert.equal(Math.round(u.hus.x + u.hus.w / 2), 240);
  assert.equal(Math.round(u.hus.y + u.hus.h / 2), 130);
  assert.equal(u.hus.src, 'https://bild.test/v1/oar/hus-r1.png');
  // 147 456 punkter är mer än 2^17, så full storlek är nivå 18 och en nivå ner 17.
  assert.ok(u.rutor.every((r) => r.src.startsWith('https://bild.test/v1/stockholm-norr@1_files/17/')));
  // Rutorna täcker hela fönstret.
  assert.ok(u.rutor.some((r) => r.x <= 0 && r.y <= 0));
  assert.ok(u.rutor.some((r) => r.x + 512 >= 480 && r.y + 512 >= 260));
});

test('i vattnet eller okänd: inget hus, ingen bild', () => {
  assert.equal(husutsnitt(FIL, 'adm8', 'https://bild.test/v1'), null);
  assert.equal(husutsnitt(FIL, 'finns-inte', 'https://bild.test/v1'), null);
});

test('ett hus vid bildens kant: fönstret stannar inom bilden', () => {
  const kant = structuredClone(FIL);
  kant.cities[0].houses.r1 = { picture: 'oar/hus-r1.png', x: 10, y: 10, w: 474, h: 354 };
  const u = husutsnitt(kant, 'ai-vision-sweden', 'https://bild.test/v1');
  assert.ok(u.rutor.every((r) => r.x >= 0 && r.y >= 0));
  assert.equal(u.rutor[0].src, 'https://bild.test/v1/stockholm-norr@1_files/17/0_0.webp');
});
