// Tester för det dagliga urvalet. Samma filter samma dag ska ge samma fem, utan att A-namn gynnas.
//   node --test src/lib/fraga/urval.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { TOMT_FILTER } from '../filter.ts';
import { urvalsfro, valjUt } from './urval.ts';

const NAMN = new Map(Array.from({ length: 40 }, (_, i) => {
  const id = `o${String(i).padStart(2, '0')}`;
  return [id, `Org ${String(i).padStart(2, '0')}`];
}));
const ALLA = [...NAMN.keys()];
const namn = (id) => NAMN.get(id) ?? id;
const jamfor = (a, b) => namn(a).localeCompare(namn(b), 'sv');

test('valjUt ger alla i namnordning när de får plats', () => {
  const ids = ['o04', 'o03', 'o02', 'o01', 'o00'];
  assert.deepEqual(valjUt(ids, namn, '2026-10-19|q=x'), {
    visade: ['o00', 'o01', 'o02', 'o03', 'o04'],
    regel: 'alla',
  });
});

test('valjUt ger fem i namnordning när fler matchar', () => {
  const ids = ['o11', 'o10', 'o09', 'o08', 'o07', 'o06', 'o05', 'o04', 'o03', 'o02', 'o01', 'o00'];
  const { visade, regel } = valjUt(ids, namn, '2026-10-19|q=x');
  assert.equal(regel, 'dagligt');
  assert.equal(visade.length, 5);
  assert.deepEqual(visade, [...visade].sort(jamfor));
  assert.ok(visade.every((id) => ids.includes(id)));
});

test('valjUt är densamma för samma frö', () => {
  const a = valjUt(ALLA, namn, '2026-10-19|q=x');
  const b = valjUt(ALLA, namn, '2026-10-19|q=x');
  assert.deepEqual(a.visade, b.visade);
});

test('valjUt byts med dagen', () => {
  const a = valjUt(ALLA, namn, '2026-10-19|q=x');
  const b = valjUt(ALLA, namn, '2026-10-20|q=x');
  assert.notDeepEqual(a.visade, b.visade);
});

test('valjUt gynnar inte A-namn', (t) => {
  const antal = new Map(ALLA.map((id) => [id, 0]));
  for (let i = 0; i < 1000; i += 1) {
    for (const id of valjUt(ALLA, namn, `2026-01-01|${i}`).visade) antal.set(id, (antal.get(id) ?? 0) + 1);
  }
  let lagst = { id: '', andel: 1 };
  let hogst = { id: '', andel: 0 };
  for (const [id, n] of antal) {
    const andel = n / 1000;
    if (andel < lagst.andel) lagst = { id, andel };
    if (andel > hogst.andel) hogst = { id, andel };
  }
  t.diagnostic(`lägst ${lagst.id} ${(lagst.andel * 100).toFixed(1)} %, högst ${hogst.id} ${(hogst.andel * 100).toFixed(1)} %`);
  assert.ok(lagst.andel >= 0.08 && hogst.andel <= 0.17, `lägst ${lagst.id} ${(lagst.andel * 100).toFixed(1)} %, högst ${hogst.id} ${(hogst.andel * 100).toFixed(1)} %`);
});

test('urvalsfro', () => {
  assert.equal(urvalsfro('2026-10-19', { ...TOMT_FILTER, omrade: ['halsa'] }), '2026-10-19|omrade=halsa');
});
