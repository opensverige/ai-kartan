// Tester för kartans filter: vilka organisationer ett filter släpper igenom och hur det skrivs i adressen.
//   npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import { normalisera, tolka } from './sok.ts';
import { passarFilter, filterTillSok, arTomt, TOMT_FILTER } from './filter.ts';

const post = (id, n, extra = {}) => ({ id, n, d: '', t: 'bolag', o: [], a: [], k: null, l: null, ...extra, nn: normalisera(n), ns: normalisera(n) });
const ALLA = [
  post('halsobolaget', 'Hälsobolaget', { a: ['halsa'], k: '1480', l: '14' }),
  post('synbolaget', 'Synbolaget', { a: ['datorseende'], k: '0180', l: '01' }),
  post('halsomyndigheten', 'Hälsomyndigheten', { t: 'myndighet', a: ['halsa'], k: '0180', l: '01' }),
  post('kodbolaget', 'Kodbolaget', { o: ['oppen_kallkod'], k: '1480', l: '14' }),
];
const filter = (f) => ({ ...TOMT_FILTER, ...f });
const urval = (f, utom) => {
  const t = tolka(f.q, ALLA);
  return ALLA.filter((o) => passarFilter(o, f, t, utom)).map((o) => o.id);
};

test('passarFilter: eller inom en facett, och mellan facetter', () => {
  assert.deepEqual(urval(filter({ omrade: ['halsa', 'datorseende'] })), ['halsobolaget', 'synbolaget', 'halsomyndigheten']);
  assert.deepEqual(urval(filter({ omrade: ['halsa', 'datorseende'], typ: ['bolag'] })), ['halsobolaget', 'synbolaget']);
});

test('passarFilter: kommunen kräver koden, och utom hoppar över platsen', () => {
  assert.deepEqual(urval(filter({ lan: '14', kommun: '1480' })), ['halsobolaget', 'kodbolaget']);
  assert.deepEqual(urval(filter({ lan: '14', kommun: '1480', omrade: ['halsa'] }), 'lan'), ['halsobolaget', 'halsomyndigheten']);
});

test('passarFilter: texten tolkas av sok.ts', () => {
  assert.deepEqual(urval(filter({ q: 'synbolaget' })), ['synbolaget']);
});

test('filterTillSok skriver i kartans ordning', () => {
  assert.equal(
    filterTillSok({ q: 'röst', erbjuder: ['produkt', 'oppen_kallkod'], typ: [], omrade: ['halsa'], lan: '14', kommun: '1480' }),
    'q=r%C3%B6st&erbjuder=produkt%2Coppen_kallkod&omrade=halsa&lan=14&kommun=1480',
  );
  assert.equal(filterTillSok(TOMT_FILTER), '');
});

test('arTomt är sant bara för ett filter utan val', () => {
  assert.equal(arTomt(TOMT_FILTER), true);
  assert.equal(arTomt(filter({ q: 'x' })), false);
  assert.equal(arTomt(filter({ kommun: '1480' })), false);
  assert.equal(arTomt(filter({ typ: ['bolag'] })), false);
});
