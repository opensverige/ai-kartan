// Tester för vakten som hindrar att ändringshistoriken skrivs över av en avkortad git-historik.
//   npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import { historikenKrymper } from './lib/historik.mjs';

test('färre rader ur git än i den sparade filen betyder att historiken är avkortad', () => {
  assert.equal(historikenKrymper(319, JSON.stringify({ antal: 345 })), true);
});

test('lika många eller fler rader är i sin ordning', () => {
  assert.equal(historikenKrymper(345, JSON.stringify({ antal: 345 })), false);
  assert.equal(historikenKrymper(346, JSON.stringify({ antal: 345 })), false);
});

test('utan sparad fil finns inget att förlora', () => {
  assert.equal(historikenKrymper(10, ''), false);
});
