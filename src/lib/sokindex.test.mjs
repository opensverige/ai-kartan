// Tester för sökindexet: vilken text en organisation går att hitta på.
//   npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import { tillSokpost } from './sokindex.ts';

const ETIKETTER = {
  typer: { infrastruktur: 'Infrastruktur' },
  typerPlural: { infrastruktur: 'Infrastruktur' },
  erbjuder: { produkt: 'Egen produkt' },
  omraden: { halsa: 'Hälsa och life science' },
  lan: { '01': 'Stockholms län' },
};
const POST = { id: '6g-ai-sweden', n: '6G AI Sweden', d: 'Erbjuder GPU-kapacitet.', kn: 'Stockholm', ln: 'Stockholms län', t: 'infrastruktur', o: ['produkt'], a: ['halsa'] };

test('tillSokpost tar med id, plats och etiketter i ns', () => {
  const p = tillSokpost(POST, ETIKETTER);
  assert.equal(p.nn, '6g ai sweden');
  for (const del of ['6g ai sweden', 'gpu-kapacitet', 'stockholm', 'stockholms lan', 'infrastruktur', 'egen produkt', 'halsa och life science']) {
    assert.ok(p.ns.includes(del), `ns saknar ${del}: ${p.ns}`);
  }
});

test('tillSokpost behåller postens egna fält och klarar saknad plats och beskrivning', () => {
  const p = tillSokpost({ ...POST, d: null, kn: null, ln: null }, ETIKETTER);
  assert.equal(p.id, '6g-ai-sweden');
  assert.deepEqual(p.a, ['halsa']);
  assert.ok(!p.ns.includes('null'));
});
