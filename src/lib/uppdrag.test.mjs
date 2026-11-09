// Tester för Tar uppdrag: ordningen, filtret, knappens namn och personnummerspärren.
//   npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import { dagensOrdning, harPersonnummer, klickUrl, lankEtikett, ortrad, passar, perKommun, UPPDRAG_API } from './uppdrag.ts';

const profil = (slug, erbjuder = 'uppdrag', distans = false, omraden = []) => ({
  slug,
  namn: slug,
  rubrik: 'r',
  lank: 'https://example.com',
  erbjuder,
  kommun: null,
  distans,
  omraden,
  bolag_namn: null,
  bolag_webbplats: null,
  uppdaterad_at: '2026-11-08T10:00:00Z',
});

test('ordningen är densamma samma dag och skiljer sig mellan dagar', () => {
  const alla = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((s) => profil(s));
  const idag = dagensOrdning(alla, '2026-11-08').map((p) => p.slug);
  assert.deepEqual(dagensOrdning([...alla].reverse(), '2026-11-08').map((p) => p.slug), idag);
  const dagar = ['2026-11-09', '2026-11-10', '2026-11-11'].map((d) => dagensOrdning(alla, d)[0].slug);
  assert.ok(new Set([idag[0], ...dagar]).size > 1, 'samma profil står först varje dag');
});

test('ordningen ändrar inte listan den får', () => {
  const alla = [profil('a'), profil('b')];
  dagensOrdning(alla, '2026-11-08');
  assert.deepEqual(alla.map((p) => p.slug), ['a', 'b']);
});

test('filtret', () => {
  const tom = { erbjuder: 'alla', distans: false, omrade: '' };
  assert.equal(passar(profil('a', 'tjanster'), { ...tom, erbjuder: 'uppdrag' }), false);
  assert.equal(passar(profil('a', 'bada'), { ...tom, erbjuder: 'uppdrag' }), true);
  assert.equal(passar(profil('a', 'uppdrag', false), { ...tom, distans: true }), false);
  assert.equal(passar(profil('a', 'uppdrag', true, ['juridik']), { ...tom, omrade: 'juridik' }), true);
  assert.equal(passar(profil('a'), { ...tom, omrade: 'juridik' }), false);
});

test('knappen heter som tjänsten', () => {
  assert.equal(lankEtikett('https://www.linkedin.com/in/kim'), 'LinkedIn');
  assert.equal(lankEtikett('https://se.linkedin.com/in/kim'), 'LinkedIn');
  assert.equal(lankEtikett('https://kim.se/portfolio'), 'kim.se');
  assert.equal(lankEtikett('inte en adress'), 'Länk');
});

test('personnummer fångas, vanliga tal gör det inte', () => {
  assert.equal(harPersonnummer('850101-1234'), true);
  assert.equal(harPersonnummer('198501011234'), true);
  assert.equal(harPersonnummer('Bygger sedan 2019 åt 100 000 användare'), false);
});

test('klicket går via funktionen och slugen kodas', () => {
  assert.equal(klickUrl('kim-e-3f9a'), `${UPPDRAG_API}/k/kim-e-3f9a`);
  assert.equal(klickUrl('a/b'), `${UPPDRAG_API}/k/a%2Fb`);
});

test('en hand per kommun, och den som bara arbetar på distans syns inte på kartan', () => {
  const p = (slug, kommun) => ({ ...profil(slug), kommun });
  const grupper = perKommun([p('a', '0180'), p('b', null), p('c', '1480'), p('d', '0180')]);
  assert.deepEqual([...grupper.keys()], ['0180', '1480']);
  assert.deepEqual(grupper.get('0180').map((x) => x.slug), ['a', 'd']);
});

test('raden under namnet säger ort och distans, eller ingenting', () => {
  const kommuner = { 1480: 'Göteborg' };
  assert.equal(ortrad({ kommun: '1480', distans: true }, kommuner), 'Göteborg · distans');
  assert.equal(ortrad({ kommun: '1480', distans: false }, kommuner), 'Göteborg');
  assert.equal(ortrad({ kommun: null, distans: true }, kommuner), 'Distans');
  // En kommunkod kartan inte känner hoppas över.
  assert.equal(ortrad({ kommun: '9999', distans: false }, kommuner), '');
});

