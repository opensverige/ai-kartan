// Tester för Pixelbyggets rutnät: adress till en ruta, ruta under en punkt, räkning och topplista.
//   npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import { RUTA, lasAnkare, ankare, rutaVidPunkt, rakna, topplista, agentrad, agentradFler, lasRutor, lasBlad, lage, lasUtgava, kartbild } from './rutnat.ts';

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
    rutnat: false,
    tanda: 3,
    totalt: 3071,
  });
  // En plats som frivilliga har börjat rita känns igen, så att den inte får en stadsknapp.
  assert.equal(lasBlad({ id: 'se-n5602-e1262', name: 'N 56,02 E 12,62', cols: 61, rows: 47, state: 'open', made: 'grid' }).rutnat, true);
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

test('raden för fler rutor börjar i rutan och ber om en i taget', () => {
  const rad = agentradFler('se-n5587-e1337', 13, 35);
  assert.match(rad, /github\.com\/opensverige\/karta\.opensverige-3d/);
  assert.match(rad, /AGENTS\.md/);
  assert.match(rad, /se-n5587-e1337 13_35/);
  assert.match(rad, /en i taget/);
});

test('lägena heter det en besökare säger', () => {
  assert.deepEqual(['fri', 'last', 'vantar', 'godkand', 'live'].map((l) => lage(l).namn), ['Ledig', 'Upptagen', 'Granskas', 'Godkänd', 'Ritad']);
});

test('varje läge har ett namn och en mening på svenska', () => {
  for (const namn of ['fri', 'last', 'vantar', 'godkand', 'live']) {
    const text = lage(namn);
    assert.ok(text.namn.length > 0 && text.mening.length > 0, namn);
    assert.ok(text.mening.split(' ').length <= 12, text.mening);
  }
});

test('kraven för att bygga en ruta följer bladets källa', async () => {
  const { krav, kalla } = await import('./rutnat.ts');
  assert.equal(kalla('stockholm-norr'), 'google');
  assert.equal(kalla('goteborg-norr'), 'oppen');
  // Ett blad i rutnätet, som Helsingborgs: Google, som alla nya orter.
  assert.equal(kalla('se-n5602-e1262'), 'google');
  const alltid = krav('goteborg-norr');
  assert.ok(alltid.some((k) => k.includes('NVIDIA') && k.includes('12 GB')));
  assert.ok(alltid.some((k) => k.includes('Windows eller Linux')));
  assert.ok(alltid.some((k) => k.includes('25 GB')));
  assert.ok(alltid.some((k) => k.includes('Python 3.11')));
  assert.ok(alltid.some((k) => k.includes('GitHub')));
  assert.ok(!alltid.some((k) => k.includes('Cesium') || k.includes('Node')));
  const google = krav('stockholm-norr');
  assert.deepEqual(google.slice(0, alltid.length), alltid);
  assert.ok(google.some((k) => k.includes('Cesium')));
  assert.ok(google.some((k) => k.includes('Node 22')));
});

test('bladets utgåva läses ur bildtjänstens fil, och är noll när den saknas eller är konstig', () => {
  const fil = { sheets: { 'stockholm-norr': { rev: 3, island: 'oar/norr-u3.webp', edge: 'oar/norr-kant-u3.png', cells: [[74, 20, 'ab']] } } };
  assert.equal(lasUtgava(fil, 'stockholm-norr'), 3);
  assert.equal(lasUtgava(fil, 'goteborg-norr'), 0);
  for (const konstig of [null, undefined, 'x', [], {}, { sheets: [] }, { sheets: { 'stockholm-norr': 3 } },
    { sheets: { 'stockholm-norr': { rev: '3' } } }, { sheets: { 'stockholm-norr': { rev: -1 } } },
    { sheets: { 'stockholm-norr': { rev: 1.5 } } }, { sheets: { 'stockholm-norr': { rev: 10000000 } } },
    { sheets: { 'stockholm-norr': { rev: true } } }]) {
    assert.equal(lasUtgava(konstig, 'stockholm-norr'), 0, JSON.stringify(konstig));
  }
});

test('kartbilden hämtas i bladets utgåva, och är basens när bladet inte har någon', () => {
  assert.equal(kartbild('https://bilder.example/v1/', 'stockholm-norr', 3), 'https://bilder.example/v1/stockholm-norr@3.dzi');
  assert.equal(kartbild('https://bilder.example/v1/', 'stockholm-norr', 0), 'https://bilder.example/v1/stockholm-norr.dzi');
});
