// Tester för kontrollen av modellens tolkningsrad och mallen som ersätter den.
//   npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import { TOMT_FILTER } from '../filter.ts';
import { godkandRad, mallrad } from './kontroll.ts';

const ETIKETTER = {
  typer: {},
  typerPlural: { larosate: 'Lärosäten och forskningsmiljöer', myndighet: 'Myndigheter' },
  omraden: { halsa: 'Hälsa och life science', datorseende: 'Datorseende' },
  erbjuder: { infrastruktur: 'Infrastruktur och hosting', oppen_kallkod: 'Öppen källkod' },
  lan: {},
};

const GOTEBORG = { sort: 'kommun', kod: '1480', namn: 'Göteborg' };

test('godkandRad underkänner marknadsord, längd, länk och organisationsnamn', () => {
  assert.equal(godkandRad('Jag visar Sveriges ledande bolag.', []), false);
  assert.equal(godkandRad('a'.repeat(201), []), false);
  assert.equal(godkandRad('Läs mer på https://x.se', []), false);
  assert.equal(godkandRad('Jag tolkar det som att du söker Sinch.', ['Sinch']), false);
});

test('godkandRad släpper en neutral rad och hoppar över korta namn', () => {
  assert.equal(godkandRad('Jag tolkar det som att du söker organisationer som arbetar med röst.', ['Sinch', 'AI']), true);
});

test('mallrad skriver område och plats', () => {
  assert.equal(
    mallrad({ ...TOMT_FILTER, omrade: ['halsa'] }, ETIKETTER, GOTEBORG),
    'Jag tolkar det som att du söker organisationer inom hälsa och life science i Göteborg.',
  );
});

test('mallrad skriver typ och sökord', () => {
  assert.equal(
    mallrad({ ...TOMT_FILTER, typ: ['larosate'], q: 'röst' }, ETIKETTER, null),
    'Jag tolkar det som att du söker lärosäten och forskningsmiljöer som nämner ”röst”.',
  );
});

test('mallrad skriver erbjuder och sökord med och', () => {
  assert.equal(
    mallrad({ ...TOMT_FILTER, erbjuder: ['infrastruktur'], q: 'känsliga' }, ETIKETTER, null),
    'Jag tolkar det som att du söker organisationer som erbjuder infrastruktur och hosting och nämner ”känsliga”.',
  );
});
