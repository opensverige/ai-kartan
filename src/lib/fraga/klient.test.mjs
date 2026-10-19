// Tester för klienten mot /api/fraga: svaren, reservvägen och att bara den senaste frågan räknas.
//   npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import { skapaKlient } from './klient.ts';

const SVAR = { sort: 'traffar', modellfel: null };
const LOKALT = { sort: 'traffar', modellfel: 'saknas' };
const KROPP = { fraga: 'röst', tidigare: [] };

function hamta(status, { kropp = SVAR, fordrojning = 0, kasta = false } = {}) {
  const anrop = [];
  const fn = async (url, init) => {
    anrop.push({ url, init });
    if (fordrojning) {
      await new Promise((resolve, reject) => {
        const t = setTimeout(resolve, fordrojning);
        init.signal?.addEventListener('abort', () => {
          clearTimeout(t);
          reject(new DOMException('avbruten', 'AbortError'));
        });
      });
    }
    if (kasta) throw new TypeError('Failed to fetch');
    return new Response(JSON.stringify(kropp), { status, headers: { 'content-type': 'application/json' } });
  };
  return { anrop, fn };
}

test('ett svar från servern', async () => {
  const { anrop, fn } = hamta(200);
  const k = skapaKlient({ fetchFn: fn, lokalt: async () => LOKALT });
  assert.deepEqual(await k.fraga(KROPP), { svar: SVAR, lage: 'server' });
  assert.equal(anrop[0].url, '/api/fraga');
  assert.equal(anrop[0].init.method, 'POST');
  assert.equal(anrop[0].init.headers['content-type'], 'application/json');
  assert.deepEqual(JSON.parse(anrop[0].init.body), KROPP);
});

test('servern nås inte: reservvägen i webbläsaren', async () => {
  for (const status of [403, 404, 405, 500, 503]) {
    const k = skapaKlient({ fetchFn: hamta(status).fn, lokalt: async () => LOKALT });
    assert.deepEqual(await k.fraga(KROPP), { svar: LOKALT, lage: 'lokal' }, String(status));
  }
  const natverk = skapaKlient({ fetchFn: hamta(200, { kasta: true }).fn, lokalt: async () => LOKALT });
  assert.deepEqual(await natverk.fraga(KROPP), { svar: LOKALT, lage: 'lokal' });
});

test('för många frågor: reservvägen med eget läge', async () => {
  const k = skapaKlient({ fetchFn: hamta(429).fn, lokalt: async () => LOKALT });
  assert.deepEqual(await k.fraga(KROPP), { svar: LOKALT, lage: 'takt' });
});

test('en ny fråga ersätter den som väntar', async () => {
  let n = 0;
  const fn = async (url, init) => {
    n += 1;
    const mitt = n;
    return hamta(200, { kropp: { ...SVAR, n: mitt }, fordrojning: mitt === 1 ? 200 : 10 }).fn(url, init);
  };
  const k = skapaKlient({ fetchFn: fn, lokalt: async () => LOKALT });
  const forsta = k.fraga({ ...KROPP, fraga: 'ett' });
  const andra = k.fraga({ ...KROPP, fraga: 'två' });
  assert.equal(await forsta, null);
  assert.equal((await andra).svar.n, 2);
});

test('går inte heller reservvägen blir det ett fel som vyn visar som Ingen anslutning', async () => {
  const k = skapaKlient({ fetchFn: hamta(404).fn, lokalt: async () => { throw new Error('kartdata saknas'); } });
  await assert.rejects(k.fraga(KROPP));
});

test('servern svarar inte i tid: reservvägen', { timeout: 2000 }, async () => {
  const k = skapaKlient({ fetchFn: hamta(200, { fordrojning: 1000 }).fn, lokalt: async () => LOKALT, tidsgrans: 50 });
  assert.deepEqual(await k.fraga(KROPP), { svar: LOKALT, lage: 'lokal' });
});
