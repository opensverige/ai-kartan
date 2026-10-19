// Tester för värdeordslistan som kartans data och Fråga kartan delar.
//   npm test
// Körs med Nodes inbyggda testkörare, utan beroenden.

import test from 'node:test';
import assert from 'node:assert/strict';
import { MARKNADSORD } from './lib/marknadsord.mjs';

test('marknadsord träffar ledande, bästa och unikt', () => {
  assert.equal(MARKNADSORD.test('Sveriges ledande bolag'), true);
  assert.equal(MARKNADSORD.test('det bästa verktyget'), true);
  assert.equal(MARKNADSORD.test('ett unikt API'), true);
  assert.equal(MARKNADSORD.test('Världsledande på röst'), true);
});

test('marknadsord träffar inte vanliga ord', () => {
  assert.equal(MARKNADSORD.test('ska bestå av tre delar'), false);
  assert.equal(MARKNADSORD.test('ledamot i styrelsen'), false);
  assert.equal(MARKNADSORD.test('Bygger röstagenter för kundtjänst.'), false);
});
