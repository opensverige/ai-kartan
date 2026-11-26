// Tester för glimten på startsidan: vilka bildrutor ur en stads kartbild den visar.
//   npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import { glimtRutor } from './glimt.ts';

const BAS = 'https://bilder.example/v1/';
// Göteborgs kartbild som bildtjänsten beskriver den.
const GOTEBORG = {
  id: 'goteborg', dzi: 'goteborg-norr.dzi', heading: 0, origin: { lat: 57.707, lon: 11.967 },
  xMeters: -16384, yMeters: 13312, groundHeight: 40, width: 133120, height: 120832, island: '', edge: '',
};

test('glimten visar två gånger två rutor runt stadens mitt, två nivåer under full storlek', () => {
  const rutor = glimtRutor(GOTEBORG, BAS);
  // Mitten ligger mellan rutorna 31 och 32, 25 och 26, på nivå 16.
  assert.deepEqual(rutor, [
    `${BAS}goteborg-norr_files/16/31_25.webp`,
    `${BAS}goteborg-norr_files/16/32_25.webp`,
    `${BAS}goteborg-norr_files/16/31_26.webp`,
    `${BAS}goteborg-norr_files/16/32_26.webp`,
  ]);
});

test('en utgåva har sitt eget namn på bildrutornas mapp', () => {
  const rutor = glimtRutor({ ...GOTEBORG, dzi: 'goteborg-norr@2.dzi' }, BAS);
  assert.ok(rutor[0].startsWith(`${BAS}goteborg-norr@2_files/16/`), rutor[0]);
});

test('blocket stannar innanför bilden när mitten ligger i hörnet', () => {
  // 8192 punkter är nivå 13. Två nivåer ner är bilden 2048 punkter: fyra rutor åt varje håll.
  const horn = { ...GOTEBORG, xMeters: 0, yMeters: 0, width: 8192, height: 8192 };
  assert.deepEqual(glimtRutor(horn, BAS).map((r) => r.slice(r.lastIndexOf('/') + 1)), ['0_0.webp', '1_0.webp', '0_1.webp', '1_1.webp']);
});

test('en bild som är för liten för två gånger två rutor ger ingen glimt', () => {
  assert.deepEqual(glimtRutor({ ...GOTEBORG, width: 2048, height: 2048 }, BAS), []);
});
