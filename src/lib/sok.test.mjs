// Tester för hur en sökning tolkas och vilka organisationer den träffar.
//   npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalisera, tolka, traffar, tomtSvar, ALIAS } from './sok.ts';

const post = (n, d, extra = {}) => ({ n, t: 'bolag', o: [], a: [], ...extra, nn: normalisera(n), ns: normalisera(`${n} ${d}`) });
const ALLA = [
  post('Ragnarök Data', 'Lagrar data i storage-kluster åt industrin.'),
  post('Svarsverket', 'Bygger RAG-system för kundtjänst med en egen språkmodell.'),
  post('Chattkommun', 'Kommunen har en chattbot som svarar på frågor om bygglov.', { t: 'kommun_region' }),
  post('Synbolaget', 'Läser av röntgenbilder.', { a: ['datorseende'] }),
  post('Kapitalet', 'Riskkapitalbolag som investerar i tidiga skeden.', { t: 'finansiar' }),
  post('Luftrum', 'Utvecklar autonoma drönare för inspektion av kraftledningar.'),
  post('Pappersflödet', 'Sorterar dokument och fakturor åt kommuner.'),
  post('Kodöppet', 'Publicerar sina modeller fritt.', { o: ['oppen_kallkod'] }),
  post('Företagsfabriken', 'Hjälper företag att komma igång.'),
];
const sok = (q) => {
  const t = tolka(q, ALLA);
  return { namn: ALLA.filter((o) => traffar(o, t)).map((o) => o.n), steg: t.steg, visat: t.visat };
};

test('en tom sökning släpper igenom alla', () => {
  assert.equal(sok('').namn.length, ALLA.length);
  assert.equal(sok('   ').namn.length, ALLA.length);
});

test('ett kort ord träffar bara i början av ett ord', () => {
  // "rag" finns inuti "storage" men det är inte det besökaren letar efter.
  assert.deepEqual(sok('RAG').namn, ['Ragnarök Data', 'Svarsverket']);
  assert.deepEqual(sok('rag-system').namn, ['Svarsverket']);
});

test('ett längre ord träffar var som helst i ett ord', () => {
  assert.deepEqual(sok('modell').namn, ['Svarsverket', 'Kodöppet']);
});

test('alla ord i sökningen ska träffa', () => {
  assert.deepEqual(sok('chattbot bygglov').namn, ['Chattkommun']);
  assert.deepEqual(sok('chattbot röntgen').namn, []);
});

test('engelska och vardagliga ord för en etikett träffar etiketten', () => {
  assert.deepEqual(sok('computer vision').namn, ['Synbolaget']);
  assert.deepEqual(sok('investors').namn, ['Kapitalet']);
  assert.deepEqual(sok('open source').namn, ['Kodöppet']);
});

test('synonymer räknas som samma ord', () => {
  assert.deepEqual(sok('chatbot').namn, ['Chattkommun']);
  assert.deepEqual(sok('LLM').namn, ['Svarsverket']);
  assert.deepEqual(sok('VC').namn, ['Kapitalet']);
  assert.deepEqual(sok('drones').namn, ['Luftrum']);
});

test('utfyllnadsord tas bort först när sökningen annars inte ger något', () => {
  const fraga = sok('vem bygger drönare');
  assert.deepEqual(fraga.namn, ['Luftrum']);
  assert.equal(fraga.steg, 'utan utfyllnadsord');
  assert.equal(fraga.visat, 'drönare');
  // "företag" är ett utfyllnadsord, men här träffar det på riktigt och får stå kvar.
  assert.deepEqual(sok('företag').namn, ['Företagsfabriken']);
  assert.equal(sok('företag').steg, 'rak');
});

test('en böjd eller sammansatt form faller tillbaka på grundformen', () => {
  const fraga = sok('dokumenthantering');
  assert.deepEqual(fraga.namn, ['Pappersflödet']);
  assert.equal(fraga.steg, 'grundform');
  assert.deepEqual(sok('drönarna').namn, ['Luftrum']);
});

test('det som inte finns ger inga träffar, hur sökningen än tolkas', () => {
  assert.deepEqual(sok('bananer').namn, []);
  assert.deepEqual(sok('företag som utvecklar bananer').namn, []);
});

test('varje alias pekar på en etikett som finns i taxonomin', () => {
  const las = (namn) => new Set(JSON.parse(fs.readFileSync(new URL(`../../data/taxonomi/${namn}.json`, import.meta.url), 'utf8')).map((e) => e.id));
  const finns = { a: las('omraden'), o: las('erbjuder'), t: las('typer') };
  for (const [fras, [falt, varde]] of Object.entries(ALIAS)) assert.ok(finns[falt].has(varde), `aliaset "${fras}" pekar på ${falt}:${varde}, som inte finns`);
});

test('en tom träfflista förklarar vad kartan inte har', () => {
  assert.equal(tomtSvar('jobb')?.sort, 'jobb');
  assert.equal(tomtSvar('lediga tjänster AI Stockholm')?.sort, 'jobb');
  assert.equal(tomtSvar('internship')?.sort, 'jobb');
  assert.equal(tomtSvar('följer AI-förordningen')?.sort, 'regler');
  assert.equal(tomtSvar('ISO 27001')?.sort, 'regler');
  assert.equal(tomtSvar('antal anställda')?.sort, 'falt');
  assert.equal(tomtSvar('pris')?.sort, 'falt');
  assert.equal(tomtSvar('bananer'), null);
  assert.equal(tomtSvar(''), null);
});

test('ord som också är namn på inbyggda egenskaper kraschar inte sökningen', () => {
  // "constructors" får stammen "constructor", som finns på varje objekt i JavaScript.
  for (const q of ['constructor', 'constructors', 'constructorsystem', '__proto__', '__proto__s', 'tostring', 'hasownproperty', 'valueof']) {
    assert.doesNotThrow(() => sok(q), q);
    assert.deepEqual(sok(q).namn, [], q);
  }
});

test('typens pluralord ger samma organisationer som filtret', () => {
  const alla = [
    post('Verket', 'Har byggt en tjänst som sorterar ärenden.', { t: 'myndighet' }),
    post('Leverantören', 'Säljer till myndigheter och kommuner.'),
    post('Staden', 'Har en chattbot.', { t: 'kommun_region' }),
    post('Högskolan', 'Forskar om språkmodeller.', { t: 'larosate' }),
    post('Nätverket', 'Ordnar träffar.', { t: 'community' }),
    post('Fonden', 'Investerar i tidiga skeden.', { t: 'finansiar' }),
    post('Armen', 'Bygger en plockrobot.', { a: ['robotik'] }),
  ];
  const namn = (q) => {
    const t = tolka(q, alla);
    return alla.filter((o) => traffar(o, t)).map((o) => o.n);
  };
  // Förut gav "myndigheter" bara den som råkade nämna ordet i sin beskrivning.
  assert.deepEqual(namn('myndigheter'), ['Verket', 'Leverantören']);
  assert.deepEqual(namn('kommuner'), ['Leverantören', 'Staden']);
  assert.deepEqual(namn('kommuner och regioner'), ['Staden']);
  assert.deepEqual(namn('lärosäten'), ['Högskolan']);
  assert.deepEqual(namn('communities'), ['Nätverket']);
  assert.deepEqual(namn('föreningar'), ['Nätverket']);
  assert.deepEqual(namn('finansiärer'), ['Fonden']);
  assert.deepEqual(namn('robotar'), ['Armen']);
});

test('pluralorden i sökningen pekar på typer som finns i taxonomin', () => {
  const typer = new Set(JSON.parse(fs.readFileSync(new URL('../../data/taxonomi/typer.json', import.meta.url), 'utf8')).map((t) => t.id));
  for (const ord of ['myndigheter', 'kommuner', 'regioner', 'kommuner och regioner', 'larosaten', 'communities', 'foreningar', 'finansiarer']) {
    assert.ok(Object.hasOwn(ALIAS, ord), `${ord} saknas`);
    assert.equal(ALIAS[ord][0], 't');
    assert.ok(typer.has(ALIAS[ord][1]), `${ord} pekar på en typ som inte finns`);
  }
});
