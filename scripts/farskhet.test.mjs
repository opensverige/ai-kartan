// Tester för regeln om när det publicerade släpar efter datan i main.
//   npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import { dagarSedan, publiceratSlapar } from './lib/farskhet.mjs';

const nu = Date.parse('2026-11-08T06:30:00Z');

test('dagarSedan räknar hela dagar och tål ett saknat datum', () => {
  assert.equal(dagarSedan('2026-11-05', nu), 3);
  assert.equal(dagarSedan('2026-11-08', nu), 0);
  assert.equal(dagarSedan(null, nu), null);
});

test('sajten som visar ett äldre datum än main släpar', () => {
  assert.deepEqual(publiceratSlapar({ publicerad: '2026-10-20', lokal: '2026-11-05', nu }), { slapar: true, dagar: 3 });
});

test('en ändring från i dag får tid att publiceras', () => {
  assert.equal(publiceratSlapar({ publicerad: '2026-11-05', lokal: '2026-11-08', nu }).slapar, false);
});

test('samma datum på sajten och i main är grönt', () => {
  assert.equal(publiceratSlapar({ publicerad: '2026-11-05', lokal: '2026-11-05', nu }).slapar, false);
});

test('en sajt som inte går att läsa släpar', () => {
  assert.equal(publiceratSlapar({ publicerad: null, lokal: '2026-11-05', nu }).slapar, true);
});

test('utan dataändring i main finns inget att jämföra', () => {
  assert.equal(publiceratSlapar({ publicerad: null, lokal: null, nu }).slapar, false);
});
