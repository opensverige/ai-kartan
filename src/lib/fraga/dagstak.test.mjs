// Tester för dagstaket: hur många frågor som får gå till modellen per dygn.
//   npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import { arModellfel } from './inferens.ts';
import { lasTak, skapaDagstak, STANDARDTAK } from './dagstak.ts';

async function sort(lofte) {
  try {
    await lofte;
    return 'svar';
  } catch (e) {
    return arModellfel(e) ? e.modellfel : 'okänt';
  }
}

test('taket släpper igenom frågor upp till gränsen och stoppar sedan utan att fråga modellen', async () => {
  let dag = '2026-10-19';
  let anrop = 0;
  const tak = skapaDagstak(2, () => dag);
  const t = tak.omsluta(async () => {
    anrop += 1;
    return { svar: anrop };
  });
  assert.equal(await sort(t('a', [])), 'svar');
  assert.equal(await sort(t('b', [])), 'svar');
  assert.equal(await sort(t('c', [])), 'tak');
  assert.equal(anrop, 2);
  dag = '2026-10-20';
  assert.equal(await sort(t('d', [])), 'svar');
  assert.equal(anrop, 3);
});

test('en fråga räknas också när modellen inte svarar', async () => {
  const tak = skapaDagstak(1, () => '2026-10-19');
  const t = tak.omsluta(async () => {
    throw new Error('nere');
  });
  assert.equal(await sort(t('a', [])), 'okänt');
  assert.equal(await sort(t('b', [])), 'tak');
});

test('taket läses ur miljön, och ett trasigt värde ger standardtaket', () => {
  assert.equal(STANDARDTAK, 500);
  assert.equal(lasTak(undefined), 500);
  assert.equal(lasTak(''), 500);
  assert.equal(lasTak('abc'), 500);
  assert.equal(lasTak('-3'), 500);
  assert.equal(lasTak('1000'), 1000);
  assert.equal(lasTak('0'), 0);
});
