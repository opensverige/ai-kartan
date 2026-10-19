// Tester för skälen på ett kort. Texten byggs ur fälten som träffade, aldrig av en modell.
//   node --test src/lib/fraga/skal.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { TOMT_FILTER } from '../filter.ts';
import { tolka } from '../sok.ts';
import { tillSokpost } from '../sokindex.ts';
import { matchskal } from './skal.ts';

const ETIKETTER = {
  typer: { bolag: 'Bolag' },
  typerPlural: {},
  erbjuder: { infrastruktur: 'Infrastruktur och hosting' },
  omraden: { halsa: 'Hälsa och life science' },
  lan: { '14': 'Västra Götalands län' },
};

const POST = tillSokpost(
  {
    id: 'rostvard',
    n: 'Röstvården',
    d: 'Bygger röstagenter för vården.',
    t: 'bolag',
    o: [],
    a: ['halsa'],
    k: '1480',
    kn: 'Göteborg',
    l: '14',
    ln: 'Västra Götalands län',
  },
  ETIKETTER,
);
const POSTER = [POST];
const filter = (f) => ({ ...TOMT_FILTER, ...f });
const skal = (f) => matchskal(POST, f, tolka(f.q, POSTER), ETIKETTER);

test('matchskal tar området och hela ordet i namnet', () => {
  assert.deepEqual(skal(filter({ omrade: ['halsa'], q: 'röst' })), ['område Hälsa och life science', '”Röstvården” i namnet']);
});

test('matchskal tar hela ordet i beskrivningen', () => {
  assert.deepEqual(skal(filter({ q: 'agenter' })), ['”röstagenter” i beskrivningen']);
});

test('matchskal tar kommunen när både kommun och län är satta', () => {
  assert.deepEqual(skal(filter({ lan: '14', kommun: '1480' })), ['Göteborg']);
});

test('matchskal rapporterar bara det som stämmer', () => {
  assert.deepEqual(skal(filter({ typ: ['bolag'], erbjuder: ['infrastruktur'] })), ['Bolag']);
});
