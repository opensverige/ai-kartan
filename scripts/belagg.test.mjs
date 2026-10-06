// Tester för de mekaniska kontrollerna av belägg (kriterium 2).
//   npm test
// Körs med Nodes inbyggda testkörare, utan beroenden.

import test from 'node:test';
import assert from 'node:assert/strict';
import { lasTaxonomi } from './lib/organisationer.mjs';
import { provaBelaggstyp, utanEgetBelagg } from './lib/belagg.mjs';

const TAX = {
  typer: [
    { id: 'finansiar', label: 'Finansiär', belagg: ['portfolj', 'program'] },
    { id: 'bolag', label: 'Bolag', belagg: ['produkt', 'repo', 'case'] },
    { id: 'utan_krav', label: 'Utan krav' },
  ],
  belaggstyper: [
    { id: 'produkt', label: 'Produkt eller tjänst' },
    { id: 'repo', label: 'Kodförråd' },
    { id: 'case', label: 'Dokumenterat case' },
    { id: 'program', label: 'Program eller utlysning' },
    { id: 'portfolj', label: 'Portfölj' },
  ],
};

function post(id, typ, belagg) {
  return { id, type: { value: typ }, evidence: belagg.map(([kind, url]) => ({ kind, url })) };
}

test('ett belägg av en typ som räknas för organisationstypen ger ingen anmärkning', () => {
  assert.equal(provaBelaggstyp(post('a', 'finansiar', [['portfolj', 'https://a.se/portfolj']]), TAX), null);
});

test('en finansiär med bara en produktlänk får veta vilka belägg som räknas', () => {
  const svar = provaBelaggstyp(post('a', 'finansiar', [['produkt', 'https://a.se']]), TAX);
  assert.match(svar, /Finansiär/);
  assert.match(svar, /Portfölj/);
  assert.match(svar, /Program eller utlysning/);
  assert.doesNotMatch(svar, /Kodförråd/);
});

test('det räcker att ett av flera belägg är av rätt typ', () => {
  const data = post('a', 'bolag', [['portfolj', 'https://a.se/kunder'], ['case', 'https://a.se/case']]);
  assert.equal(provaBelaggstyp(data, TAX), null);
});

test('en typ utan lista i taxonomin ställer inga krav på beläggstyp', () => {
  assert.equal(provaBelaggstyp(post('a', 'utan_krav', [['portfolj', 'https://a.se']]), TAX), null);
});

test('en post utan belägg lämnas åt kontrollen av att belägg finns', () => {
  assert.equal(provaBelaggstyp(post('a', 'finansiar', []), TAX), null);
});

test('en post vars alla belägglänkar också används av andra poster saknar eget belägg', () => {
  const poster = [
    post('kommun-a', 'bolag', [['repo', 'https://github.com/x/y'], ['case', 'https://b.se/plattform']]),
    post('kommun-b', 'bolag', [['case', 'https://b.se/plattform'], ['case', 'https://b.se/eget']]),
    post('bolag-c', 'bolag', [['repo', 'https://github.com/x/y'], ['produkt', 'https://c.se']]),
  ];
  const utan = utanEgetBelagg(poster);
  assert.deepEqual([...utan.keys()], ['kommun-a']);
  assert.deepEqual(utan.get('kommun-a'), ['bolag-c', 'kommun-b']);
});

test('en avslutande snedstreck gör inte två länkar olika', () => {
  const poster = [
    post('a', 'bolag', [['case', 'https://delad.se/sida/']]),
    post('b', 'bolag', [['case', 'https://delad.se/sida'], ['produkt', 'https://b.se']]),
  ];
  assert.deepEqual([...utanEgetBelagg(poster).keys()], ['a']);
});

test('varje organisationstyp i taxonomin har en lista med kända beläggstyper', () => {
  const tax = lasTaxonomi();
  const kanda = new Set(tax.belaggstyper.map((b) => b.id));
  for (const typ of tax.typer) {
    assert.ok(Array.isArray(typ.belagg) && typ.belagg.length > 0, `${typ.id} saknar belagg i data/taxonomi/typer.json`);
    for (const kind of typ.belagg) assert.ok(kanda.has(kind), `${typ.id}: okänd beläggstyp "${kind}"`);
  }
});
