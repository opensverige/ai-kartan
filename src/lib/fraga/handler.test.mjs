// Tester för serverfunktionens hanterare: vad som tas emot, vad som avvisas och att frågan aldrig loggas.
//   npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import { TOMT_FILTER } from '../filter.ts';
import { tillSokpost } from '../sokindex.ts';
import { hanteraFraga, lasKropp, MAX_KROPP } from './handler.ts';

const ETIKETTER = {
  typer: { bolag: 'Bolag' },
  typerPlural: { bolag: 'Bolag' },
  erbjuder: { infrastruktur: 'Infrastruktur och hosting' },
  omraden: { halsa: 'Hälsa och life science' },
  lan: { '14': 'Västra Götalands län' },
};
const POSTER = [
  { id: 'halsobolaget', n: 'Hälsobolaget', d: 'Tolkar journaler.', t: 'bolag', o: [], a: ['halsa'], k: '1480', kn: 'Göteborg', l: '14', ln: 'Västra Götalands län' },
].map((o) => tillSokpost(o, ETIKETTER));
const DATA = { poster: POSTER, etiketter: ETIKETTER, faqIds: ['vad-ar-opensverige'], kommuner: [{ kod: '1480', namn: 'Göteborg' }], lan: [{ kod: '14', namn: 'Västra Götalands län' }] };
const URSPRUNG = 'https://karta.opensverige.se';

function delar(andra = {}) {
  const loggat = [];
  return { loggat, d: { ursprung: [URSPRUNG], hamtaData: async () => DATA, tolkare: () => null, idag: () => '2026-10-19', logga: (rad) => loggat.push(rad), ...andra } };
}
function anrop(kropp, { metod = 'POST', ursprung = URSPRUNG } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (ursprung) headers.origin = ursprung;
  return new Request(`${URSPRUNG}/api/fraga`, { method: metod, headers, body: metod === 'POST' ? (typeof kropp === 'string' ? kropp : JSON.stringify(kropp)) : undefined });
}
const giltig = (andra = {}) => ({ fraga: 'AI inom hälsa', tidigare: [], ...andra });

test('bara POST tas emot', async () => {
  const svar = await hanteraFraga(anrop(null, { metod: 'GET' }), delar().d);
  assert.equal(svar.status, 405);
  assert.equal(svar.headers.get('allow'), 'POST');
});

test('fel ursprung och saknat ursprung avvisas', async () => {
  assert.equal((await hanteraFraga(anrop(giltig(), { ursprung: 'https://evil.example' }), delar().d)).status, 403);
  assert.equal((await hanteraFraga(anrop(giltig(), { ursprung: null }), delar().d)).status, 403);
});

test('en för stor kropp avvisas', async () => {
  const svar = await hanteraFraga(anrop(giltig({ fraga: 'x'.repeat(MAX_KROPP) })), delar().d);
  assert.equal(svar.status, 413);
});

test('trasig JSON avvisas', async () => {
  assert.equal((await hanteraFraga(anrop('{inte json'), delar().d)).status, 400);
});

test('frågan måste finnas och vara högst 300 tecken', async () => {
  for (const fraga of ['', '   ', 'x'.repeat(301), 42]) {
    assert.equal((await hanteraFraga(anrop(giltig({ fraga })), delar().d)).status, 400, String(fraga).slice(0, 10));
  }
  assert.equal((await hanteraFraga(anrop(giltig({ fraga: 'x'.repeat(300) })), delar().d)).status, 200);
});

test('högst fem tidigare frågor', async () => {
  const en = { fraga: 'hälsa', filter: { ...TOMT_FILTER, omrade: ['halsa'] } };
  assert.equal((await hanteraFraga(anrop(giltig({ tidigare: Array(5).fill(en) })), delar().d)).status, 200);
  assert.equal((await hanteraFraga(anrop(giltig({ tidigare: Array(6).fill(en) })), delar().d)).status, 400);
});

test('historik med okända filtervärden eller fel form avvisas', async () => {
  const fall = [
    [{ fraga: 'x', filter: { ...TOMT_FILTER, omrade: ['finns-inte'] } }],
    [{ fraga: 'x', filter: 'omrade=halsa' }],
    [{ fraga: 'x', filter: { ...TOMT_FILTER, kommun: '14801' } }],
    [{ fraga: 'x', filter: { ...TOMT_FILTER, lan: '99' } }],
    [{ fraga: 'x', filter: { ...TOMT_FILTER, typ: 'bolag' } }],
    [{ fraga: 'x'.repeat(301), filter: TOMT_FILTER }],
    'inte en lista',
  ];
  for (const tidigare of fall) {
    assert.equal((await hanteraFraga(anrop(giltig({ tidigare })), delar().d)).status, 400, JSON.stringify(tidigare).slice(0, 60));
  }
});

test('lasKropp tar en giltig kropp och trimmar frågan', () => {
  const k = lasKropp({ fraga: '  AI inom hälsa  ', tidigare: [{ fraga: 'hälsa', filter: { ...TOMT_FILTER, omrade: ['halsa'], lan: '14', kommun: '1480' } }] }, ETIKETTER);
  assert.equal(k.fraga, 'AI inom hälsa');
  assert.deepEqual(k.tidigare[0].filter.omrade, ['halsa']);
  assert.deepEqual(lasKropp({ fraga: 'hej' }, ETIKETTER), { fraga: 'hej', tidigare: [] });
  assert.ok('fel' in lasKropp(null, ETIKETTER));
});

test('datan går inte att hämta: 503', async () => {
  const svar = await hanteraFraga(anrop(giltig()), delar({ hamtaData: async () => { throw new Error('401'); } }).d);
  assert.equal(svar.status, 503);
});

test('ett giltigt anrop ger svaret, utan cache', async () => {
  const svar = await hanteraFraga(anrop(giltig()), delar().d);
  assert.equal(svar.status, 200);
  assert.equal(svar.headers.get('cache-control'), 'no-store');
  assert.match(svar.headers.get('content-type'), /application\/json/);
  const kropp = await svar.json();
  assert.equal(kropp.sort, 'traffar');
  assert.deepEqual(kropp.ids, ['halsobolaget']);
});

test('frågans text loggas aldrig', async () => {
  const fangat = [];
  const original = { log: console.log, error: console.error, warn: console.warn, info: console.info };
  for (const nyckel of Object.keys(original)) console[nyckel] = (...a) => fangat.push(a.map(String).join(' '));
  try {
    const { loggat, d } = delar();
    const hemlig = 'Hemlig fråga om hälsa';
    await hanteraFraga(anrop(giltig({ fraga: hemlig })), d);
    await hanteraFraga(anrop(giltig({ fraga: hemlig }), { ursprung: 'https://evil.example' }), d);
    await hanteraFraga(anrop(giltig({ fraga: hemlig })), { ...d, hamtaData: async () => { throw new Error('nere'); } });
    assert.equal(fangat.length, 0);
    assert.ok(loggat.length >= 1);
    for (const rad of loggat) assert.ok(!JSON.stringify(rad).includes('Hemlig'), JSON.stringify(rad));
    assert.deepEqual(Object.keys(loggat[0]).sort(), ['modellfel', 'ms', 'sort', 'utanModell']);
  } finally {
    Object.assign(console, original);
  }
});

test('tolkaren skapas ur datan, och felets namn hamnar i svaret och loggen', async () => {
  const { modellfel } = await import('./inferens.ts');
  let sedd = null;
  const { loggat, d } = delar({
    tolkare: (data) => {
      sedd = data;
      return async () => {
        throw modellfel('slut');
      };
    },
  });
  const svar = await hanteraFraga(anrop(giltig()), d);
  const kropp = await svar.json();
  assert.equal(sedd, DATA);
  assert.equal(kropp.modellfel, 'slut');
  assert.equal(kropp.sort, 'traffar');
  assert.equal(loggat.at(-1).modellfel, 'slut');
});

test('ett oväntat fel i motorn ger 503 och en loggrad, aldrig felets text', async () => {
  const { loggat, d } = delar({
    tolkare: () => {
      throw new Error('AI inom hälsa: oväntat');
    },
  });
  const svar = await hanteraFraga(anrop(giltig()), d);
  assert.equal(svar.status, 503);
  assert.equal(svar.headers.get('cache-control'), 'no-store');
  const kropp = await svar.text();
  assert.ok(!kropp.includes('oväntat') && !kropp.includes('AI inom hälsa'));
  assert.equal(loggat.length, 1);
  assert.equal(loggat[0].sort, 'motorfel');
  assert.ok(!JSON.stringify(loggat).includes('hälsa'));
});
