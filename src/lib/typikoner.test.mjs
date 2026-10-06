// Tester för vilka organisationstyper som får en egen ikon.
//   npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import { hittaTypikoner } from './typikoner.ts';

const TYPER = ['bolag', 'myndighet', 'kommun_region'];

test('en typ får ikon när filen med typens id finns', () => {
  const finns = (fil) => fil === 'ikoner/typ/myndighet.png';
  assert.deepEqual(hittaTypikoner(TYPER, finns), { myndighet: '/ikoner/typ/myndighet.png' });
});

test('utan filer får ingen typ ikon', () => {
  assert.deepEqual(hittaTypikoner(TYPER, () => false), {});
});

test('adressen går genom sajtens bassökväg', () => {
  const ikoner = hittaTypikoner(TYPER, () => true, (stig) => `/karta${stig}`);
  assert.equal(ikoner.kommun_region, '/karta/ikoner/typ/kommun_region.png');
  assert.equal(Object.keys(ikoner).length, 3);
});
