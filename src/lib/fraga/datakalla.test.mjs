// Tester för var serverfunktionen hämtar kartans data, och vilken kaka som följer med.
//   npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import { datakalla, skyddskaka, tillatnaUrsprung } from './datakalla.ts';

const PROD = 'https://karta.opensverige.se';

test('tillatnaUrsprung tar de egna domänerna och deploymentens adresser', () => {
  const lista = tillatnaUrsprung({ VERCEL_URL: 'abc.vercel.app', VERCEL_BRANCH_URL: 'gren.vercel.app' });
  for (const u of ['https://karta.opensverige.se', 'https://techembassy.se', 'https://www.techembassy.se', 'https://abc.vercel.app', 'https://gren.vercel.app']) assert.ok(lista.includes(u), u);
  assert.ok(!tillatnaUrsprung({}).some((u) => u.includes('undefined')));
});

test('datakalla är den egna deploymenten när den är tillåten, annars produktionen', () => {
  const tillatna = [PROD, 'https://gren.vercel.app'];
  assert.equal(datakalla('https://gren.vercel.app/api/fraga', tillatna, PROD), 'https://gren.vercel.app');
  assert.equal(datakalla('https://karta.opensverige.se/api/fraga', tillatna, PROD), PROD);
  assert.equal(datakalla('https://evil.example/api/fraga', tillatna, PROD), PROD);
  assert.equal(datakalla('inte en adress', tillatna, PROD), PROD);
});

test('skyddskaka tar bara Vercels inloggningskaka', () => {
  assert.equal(skyddskaka('a=1; _vercel_jwt=eyJ.abc.def; b=2'), '_vercel_jwt=eyJ.abc.def');
  assert.equal(skyddskaka('_vercel_jwt=x'), '_vercel_jwt=x');
  assert.equal(skyddskaka('a=1; b=2'), null);
  assert.equal(skyddskaka(null), null);
  assert.equal(skyddskaka('not_vercel_jwt=x'), null);
});
