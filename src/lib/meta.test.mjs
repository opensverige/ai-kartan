// Tester för metabeskrivningar: texten som sökmotorer och svarsmotorer visar under titeln.
//   npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import { metabeskrivning, brodsmulor } from './meta.ts';

test('en kort text lämnas som den är', () => {
  assert.equal(metabeskrivning('Bolag i Lund: Bygger språkmodeller.'), 'Bolag i Lund: Bygger språkmodeller.');
});

test('en lång text kortas vid en meningsgräns när det ryms en hel mening', () => {
  const text = 'Utvecklar en plattform för rekrytering där en AI-agent sköter den första kontakten med kandidater. ' + 'Plattformen används av kunder i flera länder och har funnits sedan 2021 enligt bolagets egen webbplats.';
  const kort = metabeskrivning(text, 155);
  assert.equal(kort, 'Utvecklar en plattform för rekrytering där en AI-agent sköter den första kontakten med kandidater.');
});

test('utan meningsgräns kortas texten vid ett ordmellanrum och får en ellips', () => {
  const text = 'Har tagit fram prototyper för en chattbot om klimatdeklarationer och för kontroll av beräkningsunderlag som körs lokalt på egna servrar och som kommer från lärprojekt under två år';
  const kort = metabeskrivning(text, 155);
  assert.ok(kort.length <= 155, `blev ${kort.length} tecken`);
  assert.ok(kort.endsWith('…'));
  assert.ok(text.startsWith(kort.slice(0, -1).trimEnd()), 'ska vara en början av texten');
  assert.ok(!/\s…$/.test(kort), 'inget mellanrum före ellipsen');
  assert.equal(text[kort.length - 1], ' ', 'ska ha kortats vid ett ordmellanrum');
});

test('en förkortning mitt i texten räknas inte som meningsgräns', () => {
  const text = 'Bolag i Stockholm: Bygger verktyg för t.ex. dokumentgranskning och avtalsanalys åt advokatbyråer, banker, försäkringsbolag och myndigheter i hela Norden sedan flera år tillbaka i tiden';
  const kort = metabeskrivning(text, 155);
  assert.ok(!kort.endsWith('t.ex.'));
  assert.ok(kort.length > 80);
});

test('radbrytningar och dubbla mellanrum städas bort', () => {
  assert.equal(metabeskrivning('Bygger  AI\nför vården.'), 'Bygger AI för vården.');
});

test('brödsmulor blir en BreadcrumbList med position och adress', () => {
  const lista = brodsmulor([['Karta', 'https://karta.opensverige.se/'], ['Organisationer', 'https://karta.opensverige.se/organisationer'], ['Lovable', 'https://karta.opensverige.se/organisation/lovable']]);
  assert.equal(lista['@type'], 'BreadcrumbList');
  assert.deepEqual(lista.itemListElement.map((x) => [x.position, x.name, x.item]), [
    [1, 'Karta', 'https://karta.opensverige.se/'],
    [2, 'Organisationer', 'https://karta.opensverige.se/organisationer'],
    [3, 'Lovable', 'https://karta.opensverige.se/organisation/lovable'],
  ]);
});
