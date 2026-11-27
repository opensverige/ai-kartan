// Tester för vilken grupp som står först i paletten medan man skriver.
//   npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import { arFraga, arPlatsnamn, forstaGrupp, platskarna, platsvikt } from './ordning.ts';

const ORG = ['Stockholm AI', 'Data & AI Stockholm', 'Sinch', 'Lunds universitet', 'Region Stockholm'];
const PLATSER = ['Stockholms län', 'Stockholm', 'Lund', 'Skåne län', 'Uppsala', 'Uppsala län', 'Dalarnas län'];

test('platsens kärna: utan kommun, län och genitivets s', () => {
  assert.equal(platskarna('Stockholms län'), 'stockholm');
  assert.equal(platskarna('Skåne län'), 'skane');
  assert.equal(platskarna('Uppsala län'), 'uppsala');
  assert.equal(platskarna('Dalarnas län'), 'dalarna');
  assert.equal(platskarna('Västra Götalands län'), 'vastra gotaland');
  assert.equal(platskarna('Lund kommun'), 'lund');
  assert.equal(platskarna('Borås'), 'boras');
});

test('ett platsnamn känns igen med och utan kommun och län', () => {
  assert.ok(arPlatsnamn('Stockholm', 'Stockholms län'));
  assert.ok(arPlatsnamn('stockholm', 'Stockholm'));
  assert.ok(arPlatsnamn('Skåne', 'Skåne län'));
  assert.ok(arPlatsnamn('Västra Götaland', 'Västra Götalands län'));
  assert.ok(arPlatsnamn('Lund kommun', 'Lund'));
  assert.ok(!arPlatsnamn('Stock', 'Stockholm'));
  assert.ok(!arPlatsnamn('', 'Stockholm'));
});

test('en fråga känns igen på frågeord, frågetecken och längd', () => {
  assert.ok(arFraga('vilka bygger röst-AI i Malmö'));
  assert.ok(arFraga('Stockholm?'));
  assert.ok(arFraga('Who builds speech AI'));
  assert.ok(arFraga('bolag som gör AI för vården i Norrland'));
  assert.ok(arFraga('Ja behöver hyra GPU'));
  assert.ok(!arFraga('Stockholm'));
  assert.ok(!arFraga('röst'));
  assert.ok(!arFraga('Sinch'));
});

test('ett ortnamn ger platsen först, inte Fråga AI', () => {
  assert.equal(forstaGrupp('Stockholm', ORG, PLATSER), 'plats');
  assert.equal(forstaGrupp('stockholm ', ORG, PLATSER), 'plats');
  assert.equal(forstaGrupp('Skåne', ORG, PLATSER), 'plats');
  assert.equal(forstaGrupp('Lund', ORG, PLATSER), 'plats');
  // Medan man skriver: början av ett ortnamn räcker från tre tecken.
  assert.equal(forstaGrupp('Stockh', ORG, PLATSER), 'plats');
  assert.equal(forstaGrupp('Stockholms', ORG, PLATSER), 'plats');
});

test('ett organisationsnamn ger organisationen först', () => {
  assert.equal(forstaGrupp('Stockholm AI', ORG, PLATSER), 'org');
  assert.equal(forstaGrupp('Sinch', ORG, PLATSER), 'org');
  assert.equal(forstaGrupp('sin', ORG, PLATSER), 'org');
  assert.equal(forstaGrupp('Region Stockholm', ORG, PLATSER), 'org');
});

test('en fråga ger Fråga AI först, också när den nämner en ort', () => {
  assert.equal(forstaGrupp('vilka bygger AI i Stockholm', ORG, PLATSER), 'ai');
  assert.equal(forstaGrupp('Stockholm?', ORG, PLATSER), 'ai');
  assert.equal(forstaGrupp('Ja behöver hyra GPU', ORG, PLATSER), 'ai');
});

test('ett ord utan namnträff ger Fråga AI först, som förut', () => {
  assert.equal(forstaGrupp('röst', ORG, PLATSER), 'ai');
  assert.equal(forstaGrupp('', ORG, PLATSER), 'ai');
  assert.equal(forstaGrupp('st', [], PLATSER), 'ai');
});

test('platsens vikt: exakt namn före kärnan', () => {
  assert.equal(platsvikt('Stockholm', 'Stockholm'), 2);
  assert.equal(platsvikt('Stockholm', 'Stockholms län'), 1);
  assert.equal(platsvikt('Stockholms län', 'Stockholms län'), 2);
  assert.equal(platsvikt('Stockholm', 'Lund'), 0);
});
