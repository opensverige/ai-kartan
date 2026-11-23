// Tester för Pixelbyggets rutnät: adress till en ruta, ruta under en punkt, räkning och topplista.
//   npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import { RUTA, lasAnkare, ankare, rutaVidPunkt, rakna, topplista, agentrad, lasRutor, lasBlad, lage } from './rutnat.ts';

test('adressen till en ruta går att läsa tillbaka', () => {
  assert.equal(ankare('goteborg-norr', 64, 52), '#goteborg-norr/64_52');
  assert.deepEqual(lasAnkare('#goteborg-norr/64_52'), { blad: 'goteborg-norr', kol: 64, rad: 52 });
  assert.deepEqual(lasAnkare('#stockholm-norr'), { blad: 'stockholm-norr', kol: null, rad: null });
});

test('en trasig adress pekar inte på något', () => {
  for (const trasig of ['', '#', '#%', '#../x/1_1', '#Goteborg/1_1', '#goteborg-norr/1', '#goteborg-norr/a_b', '#goteborg-norr/1_1/extra', '#<script>/1_1']) {
    assert.equal(lasAnkare(trasig), null, trasig);
  }
});

test('en punkt i kartbilden hör till en ruta, och utanför bilden till ingen', () => {
  const blad = { id: 'x', namn: 'X', kolumner: 130, rader: 118, oppet: true, tanda: 0, totalt: 0 };
  assert.equal(RUTA, 1024);
  assert.deepEqual(rutaVidPunkt(blad, 0, 0), { kol: 0, rad: 0 });
  assert.deepEqual(rutaVidPunkt(blad, 64 * 1024 + 5, 52 * 1024 + 1023), { kol: 64, rad: 52 });
  assert.equal(rutaVidPunkt(blad, -1, 10), null);
  assert.equal(rutaVidPunkt(blad, 130 * 1024, 10), null);
  assert.equal(rutaVidPunkt(blad, 10, 118 * 1024), null);
});

test('rutorna läses som data: okända lägen och trasiga rader hoppas över', () => {
  const rutor = lasRutor([
    [1, 2, 'live', 'Baltsar', '2026-11-23T00:00:00Z'],
    [2, 2, 'fri', null, '2026-11-23T00:00:00Z'],
    [3, 2, 'hittepa', 'x', ''],
    ['4', 2, 'fri', null, ''],
    [5, 2, 'last', '<img src=x onerror=1>', ''],
    null,
    [6],
  ]);
  assert.equal(rutor.length, 3);
  assert.deepEqual(rutor[0], { kol: 1, rad: 2, lage: 'live', namn: 'Baltsar' });
  // Ett namn som inte ser ut som ett GitHub-namn visas inte.
  assert.equal(rutor[2].namn, null);
});

test('bladet läses med sina mått', () => {
  assert.deepEqual(lasBlad({ id: 'goteborg-norr', name: 'Göteborg', cols: 130, rows: 118, state: 'open', done: 3, total: 3071 }), {
    id: 'goteborg-norr',
    namn: 'Göteborg',
    kolumner: 130,
    rader: 118,
    oppet: true,
    tanda: 3,
    totalt: 3071,
  });
  assert.equal(lasBlad({ id: '../x', name: 'X', cols: 1, rows: 1 }), null);
  assert.equal(lasBlad({ id: 'x', name: 'X', cols: 0, rows: 1 }), null);
  assert.equal(lasBlad(null), null);
});

test('räkningen delar upp rutorna per läge', () => {
  const rutor = lasRutor([
    [0, 0, 'live', 'a', ''],
    [1, 0, 'live', 'b', ''],
    [2, 0, 'godkand', 'a', ''],
    [3, 0, 'vantar', 'a', ''],
    [4, 0, 'last', 'c', ''],
    [5, 0, 'fri', null, ''],
    [6, 0, 'ute', null, ''],
  ]);
  assert.deepEqual(rakna(rutor), { tanda: 2, godkanda: 1, vantar: 1, lasta: 1, fria: 1, totalt: 6 });
});

test('topplistan räknar tända rutor per byggare, flest först', () => {
  const rutor = lasRutor([
    [0, 0, 'live', 'ada', ''],
    [1, 0, 'live', 'bo', ''],
    [2, 0, 'live', 'bo', ''],
    [3, 0, 'live', 'Cy', ''],
    [4, 0, 'live', 'cy', ''],
    [5, 0, 'live', 'cy', ''],
    [6, 0, 'vantar', 'ada', ''],
    [7, 0, 'live', null, ''],
  ]);
  assert.deepEqual(topplista(rutor, 2), [
    { namn: 'Cy', rutor: 3 },
    { namn: 'bo', rutor: 2 },
  ]);
});

test('raden till agenten nämner repot, reglerna och rutan', () => {
  const rad = agentrad('goteborg-norr', 64, 52);
  assert.match(rad, /github\.com\/opensverige\/karta\.opensverige-3d/);
  assert.match(rad, /AGENTS\.md/);
  assert.match(rad, /goteborg-norr 64_52/);
});

test('varje läge har ett namn och en mening på svenska', () => {
  for (const namn of ['fri', 'last', 'vantar', 'godkand', 'live']) {
    const text = lage(namn);
    assert.ok(text.namn.length > 0 && text.mening.length > 0, namn);
    assert.ok(text.mening.split(' ').length <= 12, text.mening);
  }
});
