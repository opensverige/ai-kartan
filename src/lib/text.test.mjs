// Tester för meningarna som sätts ihop av ett tal och ett ord.
//   npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import { antal, uppraknat, typrad, talord } from './text.ts';

test('ordet böjs efter talet', () => {
  assert.equal(antal(1, 'kommun', 'kommuner'), '1 kommun');
  assert.equal(antal(0, 'kommun', 'kommuner'), '0 kommuner');
  assert.equal(antal(12, 'kommun', 'kommuner'), '12 kommuner');
});

test('en uppräkning får "och" före det sista ledet', () => {
  assert.equal(uppraknat([]), '');
  assert.equal(uppraknat(['a']), 'a');
  assert.equal(uppraknat(['a', 'b']), 'a och b');
  assert.equal(uppraknat(['a', 'b', 'c']), 'a, b och c');
});

test('typerna räknas upp med singular när det bara finns en', () => {
  const etiketter = new Map([
    ['bolag', { label: 'Bolag', plural: 'Bolag' }],
    ['myndighet', { label: 'Myndighet', plural: 'Myndigheter' }],
    ['larosate', { label: 'Lärosäte eller forskningsmiljö', plural: 'Lärosäten och forskningsmiljöer' }],
  ]);
  const typ = (id) => etiketter.get(id);
  // Förut stod det "1 myndigheter" och "1 lärosäten och forskningsmiljöer".
  assert.equal(typrad([['bolag', 2], ['myndighet', 1], ['larosate', 1]], typ), '2 bolag, 1 myndighet och 1 lärosäte eller forskningsmiljö');
  assert.equal(typrad([['myndighet', 3]], typ), '3 myndigheter');
  // En typ utan etikett visas med sitt id hellre än att sidan kraschar.
  assert.equal(typrad([['okand', 1]], typ), '1 okand');
});

test('små tal skrivs med bokstäver', () => {
  assert.equal(talord(5), 'fem');
  assert.equal(talord(4), 'fyra');
  assert.equal(talord(14), '14');
});
