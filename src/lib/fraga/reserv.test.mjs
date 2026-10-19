// Tester för reserven: när en annan leverantör tar frågan, och när den inte gör det.
//   npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import { modellfel, arModellfel } from './inferens.ts';
import { medReserv, RESERV_SENAST_MS } from './reserv.ts';

function klocka() {
  let t = 0;
  return { nu: () => t, ga: (ms) => (t += ms) };
}
function tolkare(svar, k, tid = 0) {
  let anrop = 0;
  const fn = async () => {
    anrop += 1;
    k?.ga(tid);
    if (svar instanceof Error) throw svar;
    return svar;
  };
  return { fn, antal: () => anrop };
}
async function utfall(lofte) {
  try {
    return await lofte;
  } catch (e) {
    return arModellfel(e) ? `fel:${e.modellfel}` : 'okänt';
  }
}

test('svarar den första leverantören frågas inte reserven', async () => {
  const forsta = tolkare('berget');
  const reserv = tolkare('nebius');
  assert.equal(await utfall(medReserv(forsta.fn, reserv.fn)('q', [])), 'berget');
  assert.equal(reserv.antal(), 0);
});

test('slut på kredit, fel nyckel, borttagen modell, upptagen eller nere: reserven tar frågan', async () => {
  for (const sort of ['slut', 'nyckel', 'modell', 'begransad', 'nere']) {
    const reserv = tolkare('nebius');
    assert.equal(await utfall(medReserv(tolkare(modellfel(sort)).fn, reserv.fn)('q', [])), 'nebius', sort);
    assert.equal(reserv.antal(), 1, sort);
  }
});

test('tidsgräns och ogiltigt svar går inte vidare, för då finns ingen tid kvar', async () => {
  for (const sort of ['tidsgrans', 'ogiltig']) {
    const reserv = tolkare('nebius');
    assert.equal(await utfall(medReserv(tolkare(modellfel(sort)).fn, reserv.fn)('q', [])), `fel:${sort}`, sort);
    assert.equal(reserv.antal(), 0, sort);
  }
});

test('ett fel som kommer för sent går inte vidare, så att frågan ryms i tidsgränsen', async () => {
  const k = klocka();
  const reserv = tolkare('nebius');
  const forsta = tolkare(modellfel('nere'), k, RESERV_SENAST_MS + 1);
  assert.equal(await utfall(medReserv(forsta.fn, reserv.fn, k.nu)('q', [])), 'fel:nere');
  assert.equal(reserv.antal(), 0);
});

test('svarar ingen av dem blir det reservens fel', async () => {
  const svar = await utfall(medReserv(tolkare(modellfel('slut')).fn, tolkare(modellfel('nere')).fn)('q', []));
  assert.equal(svar, 'fel:nere');
});
