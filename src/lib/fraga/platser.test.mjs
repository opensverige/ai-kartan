// Tester för uppslag från ortsnamn till kartans kommun- eller länskod.
//   npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import { arHelaLandet, hittaPlats } from './platser.ts';

const KOMMUNER = [
  { kod: '1480', namn: 'Göteborg' },
  { kod: '0180', namn: 'Stockholm' },
  { kod: '0980', namn: 'Gotland' },
  { kod: '2480', namn: 'Umeå' },
];

const LAN = [
  { kod: '14', namn: 'Västra Götalands län' },
  { kod: '01', namn: 'Stockholms län' },
  { kod: '09', namn: 'Gotlands län' },
  { kod: '05', namn: 'Östergötlands län' },
  { kod: '24', namn: 'Västerbottens län' },
];

const plats = (text) => hittaPlats(text, KOMMUNER, LAN);

test('hittaPlats tar kommunen Göteborg', () => {
  assert.deepEqual(plats('AI i Göteborg'), { sort: 'kommun', kod: '1480', namn: 'Göteborg' });
});

test('hittaPlats tar kommunen Stockholm före länet', () => {
  assert.deepEqual(plats('bolag i Stockholm'), { sort: 'kommun', kod: '0180', namn: 'Stockholm' });
});

test('hittaPlats tar länet när bara länet finns', () => {
  assert.deepEqual(plats('datorseende i Västerbotten'), { sort: 'lan', kod: '24', namn: 'Västerbottens län' });
});

test('hittaPlats ger null för en okänd plats', () => {
  assert.equal(plats('Norrland'), null);
});

test('hittaPlats tar kommunen Gotland', () => {
  assert.deepEqual(plats('AI på Gotland'), { sort: 'kommun', kod: '0980', namn: 'Gotland' });
});

test('hittaPlats låter inte Gotland träffa inuti Östergötland', () => {
  assert.deepEqual(plats('AI i Östergötland'), { sort: 'lan', kod: '05', namn: 'Östergötlands län' });
});

test('hittaPlats träffar Umeå med och utan prickar', () => {
  assert.deepEqual(plats('Umeå'), { sort: 'kommun', kod: '2480', namn: 'Umeå' });
  assert.deepEqual(plats('umea'), { sort: 'kommun', kod: '2480', namn: 'Umeå' });
});

test('hittaPlats tar länet när hela länsnamnet står, även om en kommun heter likadant', () => {
  assert.deepEqual(plats('AI i Stockholms län'), { sort: 'lan', kod: '01', namn: 'Stockholms län' });
  assert.deepEqual(plats('bolag i Gotlands län'), { sort: 'lan', kod: '09', namn: 'Gotlands län' });
  assert.deepEqual(plats('i Västra Götalands län'), { sort: 'lan', kod: '14', namn: 'Västra Götalands län' });
});

test('hela landet är ingen plats att filtrera på', () => {
  for (const text of ['Sverige', 'hela Sverige', 'i Sverige', 'Sweden', 'hela landet']) assert.equal(arHelaLandet(text), true, text);
  for (const text of ['Göteborg', 'Västsverige', 'Norrland']) assert.equal(arHelaLandet(text), false, text);
});
