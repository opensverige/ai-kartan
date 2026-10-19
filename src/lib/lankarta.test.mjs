// Tester för länskartan: projektionen, förenklingen och prickarna.
//   npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import { ringar, projektion, forenkla, bana, prickradie, ritaLan } from './lankarta.ts';

const kvadrat = { type: 'Polygon', coordinates: [[[15, 60], [17, 60], [17, 62], [15, 62], [15, 60]]] };
const radie = { min: 5, steg: 4, max: 20 };

test('en multipolygon ger alla sina ringar', () => {
  const g = { type: 'MultiPolygon', coordinates: [kvadrat.coordinates, kvadrat.coordinates] };
  assert.equal(ringar(g).length, 2);
});

test('projektionen ryms i rutan och krymper längdgraderna mot norr', () => {
  const p = projektion(ringar(kvadrat), 400, 400, 10);
  assert.ok(p.bredd <= 400 && p.hojd <= 400);
  // Två längdgrader vid 61° N är ungefär hälften så breda som två breddgrader.
  assert.ok(p.bredd < p.hojd * 0.6, `${p.bredd} × ${p.hojd}`);
  assert.deepEqual(p.punkt(15, 62), [10, 10]);
});

test('norr är uppåt', () => {
  const p = projektion(ringar(kvadrat), 400, 400, 0);
  assert.ok(p.punkt(16, 61.9)[1] < p.punkt(16, 60.1)[1]);
});

test('förenklingen tar bort punkter tätare än toleransen men behåller ringens ändar', () => {
  const ring = [[0, 0], [0.1, 0], [0.2, 0], [5, 0], [5, 5], [0, 0]];
  assert.deepEqual(forenkla(ring, 1), [[0, 0], [5, 0], [5, 5], [0, 0]]);
});

test('en ö mindre än minsta ytan ritas inte', () => {
  const stor = [[0, 0], [10, 0], [10, 10], [0, 0]];
  const liten = [[0, 0], [1, 0], [1, 1], [0, 0]];
  assert.equal(bana([stor, liten], 2), 'M0 0L10 0L10 10L0 0Z');
});

test('prickens yta följer antalet, inom min och max', () => {
  assert.equal(prickradie(1, radie), 5);
  assert.equal(prickradie(4, radie), 9);
  assert.equal(prickradie(10000, radie), 20);
});

test('kommuner utan organisationer får ingen prick, och den största ritas först', () => {
  const prickar = [
    { kod: '2', namn: 'B', slug: 'b', lat: 61, lng: 16, antal: 1 },
    { kod: '1', namn: 'A', slug: 'a', lat: 61.5, lng: 16.5, antal: 9 },
    { kod: '3', namn: 'C', slug: 'c', lat: 60.5, lng: 15.5, antal: 0 },
  ];
  const r = ritaLan(kvadrat, [kvadrat], prickar, { maxBredd: 300, maxHojd: 300, marginal: 10, radie });
  assert.deepEqual(r.prickar.map((p) => p.namn), ['A', 'B']);
  assert.ok(r.land.startsWith('M') && r.granser.startsWith('M'));
});
