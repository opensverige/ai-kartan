// Tester för frågorna i kartans bottenblad: vilka som ritas, vad de heter och när en är vald.
//   npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import { FRAGEMALLAR, fragor, arVald } from './fragor.ts';

const poster = [
  { t: 'bolag', o: ['produkt'], a: ['halsa'], k: '1480', kn: 'Göteborg' },
  { t: 'bolag', o: ['produkt', 'oppen_kallkod'], a: ['datorseende'], k: '1480', kn: 'Göteborg' },
  { t: 'finansiar', o: ['finansiering'], a: ['generell'], k: '0180', kn: 'Stockholm' },
  { t: 'myndighet', o: ['forskning'], a: ['halsa', 'offentlig_sektor'], k: null, kn: null },
];
const etikett = {
  omrade: (id) => ({ halsa: 'Hälsa och life science', datorseende: 'Datorseende' })[id] ?? id,
  typer: (id) => ({ finansiar: 'Finansiärer', myndighet: 'Myndigheter' })[id] ?? id,
  erbjuder: (id) => ({ oppen_kallkod: 'Öppen källkod' })[id] ?? id,
};
const tomt = { q: '', erbjuder: [], typ: [], omrade: [], lan: '', kommun: '' };

test('en fråga bär sitt antal och en adress som kartan kan läsa', () => {
  const rad = fragor([{ kommun: '1480' }, { omrade: 'halsa' }, { typ: 'finansiar' }, { erbjuder: 'oppen_kallkod' }], poster, etikett);
  assert.deepEqual(rad, [
    { text: 'Göteborg', antal: 2, sok: 'kommun=1480' },
    { text: 'Hälsa och life science', antal: 2, sok: 'omrade=halsa' },
    { text: 'Finansiärer', antal: 1, sok: 'typ=finansiar' },
    { text: 'Öppen källkod', antal: 1, sok: 'erbjuder=oppen_kallkod' },
  ]);
});

test('en egen kort text går före etiketten', () => {
  assert.equal(fragor([{ omrade: 'halsa', text: 'Hälsa' }], poster, etikett)[0].text, 'Hälsa');
});

test('en fråga utan träffar ritas inte', () => {
  // Ett id som har bytt namn i taxonomin, eller en kommun som har tömts, ska inte ge ett dött piller.
  assert.deepEqual(fragor([{ omrade: 'robotik' }, { kommun: '2580' }, { typ: 'finansiar' }], poster, etikett).map((f) => f.sok), ['typ=finansiar']);
});

test('en fråga kan kombinera plats och område', () => {
  assert.deepEqual(fragor([{ kommun: '1480', omrade: 'datorseende' }], poster, etikett), [{ text: 'Datorseende i Göteborg', antal: 1, sok: 'omrade=datorseende&kommun=1480' }]);
});

test('en fråga är vald när urvalet är just den, varken mer eller mindre', () => {
  assert.equal(arVald('omrade=halsa', { ...tomt, omrade: ['halsa'] }), true);
  assert.equal(arVald('omrade=halsa', tomt), false);
  assert.equal(arVald('omrade=halsa', { ...tomt, omrade: ['halsa', 'robotik'] }), false);
  assert.equal(arVald('omrade=halsa', { ...tomt, omrade: ['halsa'], typ: ['bolag'] }), false);
  assert.equal(arVald('omrade=halsa', { ...tomt, omrade: ['halsa'], q: 'vård' }), false);
  assert.equal(arVald('omrade=halsa', { ...tomt, omrade: ['halsa'], lan: '14' }), false);
});

test('en vald kommun har alltid sitt län med sig i filtret', () => {
  assert.equal(arVald('kommun=1480', { ...tomt, lan: '14', kommun: '1480' }), true);
  assert.equal(arVald('kommun=1480', { ...tomt, lan: '14' }), false);
  assert.equal(arVald('kommun=1480', { ...tomt, lan: '01', kommun: '0180' }), false);
});

test('mallarna pekar på platser, områden, typer och det som erbjuds, aldrig på en organisation', () => {
  const tillatna = new Set(['kommun', 'omrade', 'typ', 'erbjuder', 'text']);
  for (const mall of FRAGEMALLAR) {
    for (const nyckel of Object.keys(mall)) assert.ok(tillatna.has(nyckel), `okänd nyckel ${nyckel}`);
  }
  assert.ok(FRAGEMALLAR.length >= 3);
});
