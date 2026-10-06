// Tester för nedladdningen av ett urval som CSV.
//   npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import { lasCsv, skrivCsv, urvalSomCsv } from './csv.ts';

// Samma form som /api/data.csv: kommatecken mellan fälten, CRLF mellan raderna.
const HEL = [
  'id,url,name,description,offers',
  'alfa,https://karta.example/organisation/alfa,Alfa AB,"Bygger verktyg, bland annat för ""citat"".",produkt|data',
  'beta,https://karta.example/organisation/beta,Beta,"Två rader\r\ni samma fält",forskning',
  'gamma,https://karta.example/organisation/gamma,Gamma; med semikolon,Enkel text,community',
  '',
].join('\r\n');

test('lasCsv håller ihop fält med kommatecken, citattecken och radbrytning', () => {
  const rader = lasCsv(HEL);
  assert.equal(rader.length, 4);
  assert.equal(rader[1][3], 'Bygger verktyg, bland annat för "citat".');
  assert.equal(rader[2][3], 'Två rader\r\ni samma fält');
  assert.deepEqual(rader[3], ['gamma', 'https://karta.example/organisation/gamma', 'Gamma; med semikolon', 'Enkel text', 'community']);
});

test('skrivCsv citerar bara fält som innehåller avgränsaren, citattecken eller radbrytning', () => {
  assert.equal(skrivCsv([['a', 'b;c', 'säger "hej"', 'rad1\nrad2', 'd,e']], ';'), 'a;"b;c";"säger ""hej""";"rad1\nrad2";d,e\r\n');
});

test('urvalet innehåller rubrikraden och bara de valda posterna, i vald ordning', () => {
  const ut = urvalSomCsv(HEL, ['gamma', 'alfa', 'finns-inte']);
  const rader = lasCsv(ut.slice(1), ';');
  assert.deepEqual(rader.map((r) => r[0]), ['id', 'gamma', 'alfa']);
  assert.equal(rader[1][2], 'Gamma; med semikolon');
  assert.equal(rader[2][3], 'Bygger verktyg, bland annat för "citat".');
});

test('urvalet öppnas rätt i Excel med svenska inställningar: BOM först och semikolon mellan fälten', () => {
  const ut = urvalSomCsv(HEL, ['beta']);
  assert.equal(ut.charCodeAt(0), 0xfeff);
  assert.equal(ut.slice(1).split('\r\n')[0], 'id;url;name;description;offers');
});
