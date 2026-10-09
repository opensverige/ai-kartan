// Tester för rubriken över listan, som följer filtret.
//   npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import { urvalsrubrik, RUBRIK_ALLA } from './urvalsrubrik.ts';

const etikett = {
  omrade: (id) => ({ datorseende: 'Datorseende', halsa: 'Hälsa och life science' })[id] ?? id,
  typer: (id) => ({ myndighet: 'Myndigheter', bolag: 'Bolag' })[id] ?? id,
};
const rubrik = (u) => urvalsrubrik({ q: '', erbjuder: [], typ: [], omrade: [], plats: null, ...u }, etikett);

test('utan filter heter listan Alla organisationer', () => {
  assert.equal(rubrik({}), RUBRIK_ALLA);
});

test('en vald plats står i rubriken', () => {
  assert.equal(rubrik({ plats: 'Östergötlands län' }), 'Organisationer i Östergötlands län');
  assert.equal(rubrik({ plats: 'Linköping' }), 'Organisationer i Linköping');
});

test('ett enda område sägs i rubriken, med platsen eller hela landet', () => {
  assert.equal(rubrik({ omrade: ['datorseende'] }), 'Datorseende i Sverige');
  assert.equal(rubrik({ omrade: ['halsa'], plats: 'Uppsala' }), 'AI inom hälsa och life science i Uppsala');
});

test('en enda typ sägs i plural', () => {
  assert.equal(rubrik({ typ: ['myndighet'], plats: 'Stockholm' }), 'Myndigheter i Stockholm');
  assert.equal(rubrik({ typ: ['bolag'] }), 'Bolag i Sverige');
});

test('fler val än ett, en sökning eller något som erbjuds ger bara platsen', () => {
  assert.equal(rubrik({ typ: ['bolag'], omrade: ['halsa'], plats: 'Lund' }), 'Organisationer i Lund');
  assert.equal(rubrik({ omrade: ['halsa', 'datorseende'] }), 'Urval av organisationer');
  assert.equal(rubrik({ q: 'drönare' }), 'Urval av organisationer');
  assert.equal(rubrik({ q: 'drönare', omrade: ['halsa'], plats: 'Lund' }), 'Organisationer i Lund');
  assert.equal(rubrik({ erbjuder: ['forskning'] }), 'Urval av organisationer');
});
