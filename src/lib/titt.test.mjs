// Tester för texten i bottenbladets nedfällda läge: vad en besökare i telefon läser först.
//   npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import { RUBRIK_KARTAN, tittext, uppraknade } from './titt.ts';

const hela = { oppet: false, vald: null, urval: null, antal: 339, totalt: 339, kommuner: 51, nya: 0, namn: [] };

test('hela kartan: vad sidan är, hur mycket den rymmer och vad som skiljer den från en lista', () => {
  assert.deepEqual(tittext(hela), {
    rubrik: RUBRIK_KARTAN,
    not: '339 organisationer i 51 kommuner. Källa och datum på varje uppgift.',
  });
});

test('veckans nya sägs när det finns några', () => {
  assert.equal(tittext({ ...hela, nya: 20 }).not, '339 organisationer i 51 kommuner · 20 nya i veckan. Källa och datum på varje uppgift.');
  assert.equal(tittext({ ...hela, nya: 1 }).not, '339 organisationer i 51 kommuner · 1 ny i veckan. Källa och datum på varje uppgift.');
});

test('ett urval säger sitt namn, sitt antal och de första som finns i det', () => {
  const namn = ['Chalmers AI Society', 'Detectivio', 'Einride', 'Fever', 'Hack23'];
  assert.deepEqual(tittext({ ...hela, urval: 'Datorseende i Göteborg', antal: 13, namn }), {
    rubrik: 'Datorseende i Göteborg',
    not: '13 av 339 organisationer: Chalmers AI Society, Detectivio, Einride och 10 till.',
  });
});

test('ett litet urval räknas upp helt, och ordet böjs efter talet närmast', () => {
  assert.equal(tittext({ ...hela, urval: 'Organisationer i Kiruna', antal: 1, namn: ['IRF'] }).not, '1 av 339 organisationer: IRF.');
  assert.equal(tittext({ ...hela, urval: 'Organisationer i Luleå', antal: 2, namn: ['LTU', 'RISE'] }).not, '2 av 339 organisationer: LTU och RISE.');
  assert.equal(tittext({ ...hela, totalt: 1, urval: 'Juridik i Sverige', antal: 1, namn: ['Lex'] }).not, '1 av 1 organisation: Lex.');
});

test('ett tomt urval säger vad som går att göra', () => {
  assert.deepEqual(tittext({ ...hela, urval: 'Urval av organisationer', antal: 0, namn: [] }), {
    rubrik: 'Urval av organisationer',
    not: 'Inga organisationer matchar. Ta bort ett filter eller sök bredare.',
  });
});

test('en vald organisation står med sitt namn, även när ett urval ligger under', () => {
  const vald = { namn: 'AI Sweden', under: 'Lärosäte eller forskningsmiljö · Göteborg' };
  assert.deepEqual(tittext({ ...hela, vald, urval: 'Organisationer i Västra Götalands län', antal: 54 }), { rubrik: 'AI Sweden', not: vald.under });
});

test('det uppfällda bladet säger bara hur man kommer tillbaka', () => {
  assert.deepEqual(tittext({ ...hela, oppet: true, vald: { namn: 'AI Sweden', under: 'x' } }), { rubrik: 'Visa kartan', not: '' });
});

test('namn räknas upp som i löpande text', () => {
  assert.equal(uppraknade(['A'], 1), 'A');
  assert.equal(uppraknade(['A', 'B'], 2), 'A och B');
  assert.equal(uppraknade(['A', 'B', 'C'], 3), 'A, B och C');
  assert.equal(uppraknade(['A', 'B', 'C', 'D'], 4), 'A, B, C och 1 till');
  assert.equal(uppraknade(['A', 'B', 'C', 'D'], 40), 'A, B, C och 37 till');
});
