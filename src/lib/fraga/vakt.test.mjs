// Tester för vakten som slutar fråga modellen en stund när den inte kan svara.
//   npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import { modellfel, arModellfel } from './inferens.ts';
import { skapaVakt, PAUS_SLUT_MS, PAUS_KORT_MS } from './vakt.ts';

function klocka(start = 0) {
  let t = start;
  return { nu: () => t, ga: (ms) => (t += ms) };
}
function tolkare(svar) {
  let anrop = 0;
  const fn = async () => {
    anrop += 1;
    const s = typeof svar === 'function' ? svar(anrop) : svar;
    if (s instanceof Error) throw s;
    return s;
  };
  return { fn, antal: () => anrop };
}
async function namn(lofte) {
  try {
    await lofte;
    return 'svar';
  } catch (e) {
    return arModellfel(e) ? e.modellfel : 'okänt';
  }
}
const SVAR = { avsikt: 'hitta' };

test('ett svar släpps igenom', async () => {
  const k = klocka();
  const t = tolkare(SVAR);
  const vakt = skapaVakt(k.nu);
  assert.equal(await vakt.omsluta(t.fn)('fråga', []), SVAR);
});

test('slut på krediter pausar i 15 minuter utan nya anrop', async () => {
  const k = klocka();
  const t = tolkare(modellfel('slut'));
  const vakt = skapaVakt(k.nu);
  const omsluten = vakt.omsluta(t.fn);
  assert.equal(await namn(omsluten('a', [])), 'slut');
  assert.equal(await namn(omsluten('b', [])), 'slut');
  assert.equal(t.antal(), 1);
  k.ga(PAUS_SLUT_MS - 1);
  assert.equal(await namn(omsluten('c', [])), 'slut');
  assert.equal(t.antal(), 1);
  k.ga(2);
  await namn(omsluten('d', []));
  assert.equal(t.antal(), 2);
  assert.equal(PAUS_SLUT_MS, 15 * 60 * 1000);
});

test('fel nyckel pausar som slut på krediter', async () => {
  const k = klocka();
  const t = tolkare(modellfel('nyckel'));
  const omsluten = skapaVakt(k.nu).omsluta(t.fn);
  await namn(omsluten('a', []));
  assert.equal(await namn(omsluten('b', [])), 'nyckel');
  assert.equal(t.antal(), 1);
});

test('upptaget pausar en minut', async () => {
  const k = klocka();
  const t = tolkare(modellfel('begransad'));
  const omsluten = skapaVakt(k.nu).omsluta(t.fn);
  await namn(omsluten('a', []));
  assert.equal(await namn(omsluten('b', [])), 'begransad');
  assert.equal(t.antal(), 1);
  k.ga(PAUS_KORT_MS);
  await namn(omsluten('c', []));
  assert.equal(t.antal(), 2);
  assert.equal(PAUS_KORT_MS, 60 * 1000);
});

test('tre fel i rad pausar en minut, ett svar emellan nollställer', async () => {
  const k = klocka();
  const t = tolkare((n) => (n === 3 ? SVAR : modellfel('tidsgrans')));
  const omsluten = skapaVakt(k.nu).omsluta(t.fn);
  await namn(omsluten('1', []));
  await namn(omsluten('2', []));
  assert.equal(await namn(omsluten('3', [])), 'svar');
  await namn(omsluten('4', []));
  await namn(omsluten('5', []));
  assert.equal(t.antal(), 5);
  await namn(omsluten('6', []));
  assert.equal(t.antal(), 6);
  assert.equal(await namn(omsluten('7', [])), 'tidsgrans');
  assert.equal(t.antal(), 6);
});

test('vakten delas mellan tolkare, så en ny tolkare ärver pausen', async () => {
  const k = klocka();
  const vakt = skapaVakt(k.nu);
  const forsta = tolkare(modellfel('slut'));
  await namn(vakt.omsluta(forsta.fn)('a', []));
  const andra = tolkare(SVAR);
  assert.equal(await namn(vakt.omsluta(andra.fn)('b', [])), 'slut');
  assert.equal(andra.antal(), 0);
});

test('ett fel utan namn räknas som nere', async () => {
  const k = klocka();
  const t = tolkare(new Error('okänt'));
  assert.equal(await namn(skapaVakt(k.nu).omsluta(t.fn)('a', [])), 'nere');
});
