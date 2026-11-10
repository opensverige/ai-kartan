// Tester för Tar uppdrag: ordningen, sökningen, kunskaperna, länken och personnummerspärren.
//   npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bildUrl,
  dagensOrdning,
  forslagFranGithub,
  giltigKunskap,
  harPersonnummer,
  klickUrl,
  lankEtikett,
  lanktyp,
  medKunskap,
  ortrad,
  perKommun,
  snabbval,
  sokProfiler,
  somRubrik,
  uppdragstraff,
  UPPDRAG_API,
} from './uppdrag.ts';

const profil = (slug, erbjuder = 'uppdrag', distans = false, omraden = []) => ({
  slug,
  namn: slug,
  rubrik: 'r',
  lank: 'https://example.com',
  erbjuder,
  kommun: null,
  distans,
  omraden,
  kunskaper: [],
  bolag_namn: null,
  bolag_webbplats: null,
  uppdaterad_at: '2026-11-08T10:00:00Z',
});

test('ordningen är densamma samma dag och skiljer sig mellan dagar', () => {
  const alla = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((s) => profil(s));
  const idag = dagensOrdning(alla, '2026-11-08').map((p) => p.slug);
  assert.deepEqual(dagensOrdning([...alla].reverse(), '2026-11-08').map((p) => p.slug), idag);
  const dagar = ['2026-11-09', '2026-11-10', '2026-11-11'].map((d) => dagensOrdning(alla, d)[0].slug);
  assert.ok(new Set([idag[0], ...dagar]).size > 1, 'samma profil står först varje dag');
});

test('ordningen ändrar inte listan den får', () => {
  const alla = [profil('a'), profil('b')];
  dagensOrdning(alla, '2026-11-08');
  assert.deepEqual(alla.map((p) => p.slug), ['a', 'b']);
});

const uppslag = { kommuner: { 1480: 'Göteborg', '0180': 'Stockholm' }, omraden: { sprakteknik: 'Språkteknik', agenter_automation: 'Agenter och automation' } };
const medlemmar = [
  { ...profil('sara-n-3f9a', 'uppdrag', true, ['sprakteknik']), namn: 'Sara N', rubrik: 'Bygger röstagenter för kundtjänst', kommun: '0180', kunskaper: ['RAG', 'Python'] },
  { ...profil('minh-t-07c2', 'tjanster', false, ['agenter_automation']), namn: 'Minh T', rubrik: 'Automatiserar ärendeflöden och storage', kommun: '1480', kunskaper: ['n8n', 'Python', 'C#'] },
  { ...profil('yassin-k-5d10', 'bada', true, []), namn: 'Yassin K', rubrik: 'Utvärderar språkmodeller', bolag_namn: 'Mätverket AB', kunskaper: ['Utvärdering', 'rag'] },
];
const slugar = (lista) => lista.map((p) => p.slug);

test('sökningen går på namn, rad, kunskaper, område, ort, distans och bolag', () => {
  const sok = (q) => slugar(sokProfiler(medlemmar, q, uppslag));
  assert.deepEqual(sok(''), slugar(medlemmar));
  assert.deepEqual(sok('  '), slugar(medlemmar));
  assert.deepEqual(sok('minh'), ['minh-t-07c2']);
  assert.deepEqual(sok('röstagenter'), ['sara-n-3f9a']);
  assert.deepEqual(sok('python'), ['sara-n-3f9a', 'minh-t-07c2']);
  assert.deepEqual(sok('c#'), ['minh-t-07c2']);
  assert.deepEqual(sok('Agenter och automation'), ['minh-t-07c2']);
  assert.deepEqual(sok('goteborg'), ['minh-t-07c2']);
  assert.deepEqual(sok('distans'), ['sara-n-3f9a', 'yassin-k-5d10']);
  assert.deepEqual(sok('tjänster'), ['minh-t-07c2', 'yassin-k-5d10']);
  assert.deepEqual(sok('mätverket'), ['yassin-k-5d10']);
});

test('varje ord i sökningen ska träffa, och ett kort ord ska stå i början av ett ord', () => {
  const sok = (q) => slugar(sokProfiler(medlemmar, q, uppslag));
  assert.deepEqual(sok('python stockholm'), ['sara-n-3f9a']);
  assert.deepEqual(sok('python, distans'), ['sara-n-3f9a']);
  // "rag" står i "storage" hos Minh, men inte i början av ett ord.
  assert.deepEqual(sok('rag'), ['sara-n-3f9a', 'yassin-k-5d10']);
  assert.deepEqual(sok('rust'), []);
});

test('sökningen tål en profil utan kunskaper, som från en äldre version av funktionen', () => {
  const { kunskaper: _bort, ...gammal } = medlemmar[0];
  assert.deepEqual(slugar(sokProfiler([gammal], 'sara', uppslag)), ['sara-n-3f9a']);
});

test('valen under sökfältet är orden flest har angett, och vart och ett ger en träff', () => {
  const val = snabbval(medlemmar, uppslag);
  assert.deepEqual(val.slice(0, 3), ['Distans', 'Python', 'RAG']);
  assert.ok(val.includes('Språkteknik') && val.includes('n8n'));
  for (const v of val) assert.ok(sokProfiler(medlemmar, v, uppslag).length > 0, v);
  assert.deepEqual(snabbval(medlemmar, uppslag, 2), ['Distans', 'Python']);
  assert.deepEqual(snabbval([profil('a')], uppslag), []);
});

test('kartans sök får antalet och sökningen, aldrig något annat', () => {
  assert.deepEqual(uppdragstraff(medlemmar, 'python', uppslag), { antal: 2, q: 'python' });
  assert.deepEqual(uppdragstraff(medlemmar, ' Göteborg ', uppslag), { antal: 1, q: 'Göteborg' });
  assert.equal(uppdragstraff(medlemmar, 'rust', uppslag), null);
  assert.equal(uppdragstraff(medlemmar, 'p', uppslag), null);
  assert.equal(uppdragstraff(medlemmar, '', uppslag), null);
  assert.equal(uppdragstraff([], 'python', uppslag), null);
  // Den som söker på att anlita någon får hela listan, utan sökord.
  assert.deepEqual(uppdragstraff(medlemmar, 'Frilansare', uppslag), { antal: 3, q: '' });
  assert.deepEqual(uppdragstraff(medlemmar, 'konsult', uppslag), { antal: 3, q: '' });
});

test('kunskaper: korta ord, högst sex, samma ord räknas en gång', () => {
  for (const ok of ['RAG', 'C#', 'C++', 'Node.js', '.NET', 'CI/CD', 'R', 'Röst och tal', 'AI-förordningen']) assert.equal(giltigKunskap(ok), true, ok);
  for (const fel of ['', 'x'.repeat(25), '<b>', 'https://kim.se', 'kim@kim.se', '850101-1234', ' RAG']) assert.equal(giltigKunskap(fel), false, fel);
  assert.deepEqual(medKunskap(['RAG'], ' Python '), ['RAG', 'Python']);
  assert.deepEqual(medKunskap(['RAG'], 'rag'), ['RAG']);
  assert.deepEqual(medKunskap(['RAG'], 'en hel mening om vad jag kan göra'), ['RAG']);
  assert.deepEqual(medKunskap(['a', 'b', 'c', 'd', 'e', 'f'], 'g'), ['a', 'b', 'c', 'd', 'e', 'f']);
  const lista = ['RAG'];
  medKunskap(lista, 'Python');
  assert.deepEqual(lista, ['RAG']);
});

test('länken avgör vad som går att hämta', () => {
  assert.deepEqual(lanktyp('https://github.com/kim-e'), { typ: 'github', namn: 'kim-e' });
  assert.deepEqual(lanktyp('https://www.github.com/kim-e/ett-forrad'), { typ: 'github', namn: 'kim-e' });
  assert.equal(lanktyp('https://github.com/orgs/opensverige'), null);
  assert.equal(lanktyp('https://github.com/'), null);
  assert.deepEqual(lanktyp('https://x.com/kim_e'), { typ: 'x', namn: 'kim_e' });
  assert.deepEqual(lanktyp('https://twitter.com/kim_e/status/1'), { typ: 'x', namn: 'kim_e' });
  assert.equal(lanktyp('https://x.com/home'), null);
  assert.deepEqual(lanktyp('https://se.linkedin.com/in/kim'), { typ: 'linkedin' });
  assert.deepEqual(lanktyp('https://www.kim.se/portfolio'), { typ: 'sida', host: 'kim.se' });
  assert.equal(lanktyp('http://kim.se'), null);
  assert.equal(lanktyp('kim.se'), null);
  assert.equal(lanktyp('https://localhost/'), null);
});

test('förslagen från GitHub är språk och ämnesord ur egna förråd, vanligast först', () => {
  const forrad = [
    { fork: false, language: 'Python', topics: ['rag', 'llm'] },
    { fork: false, language: 'Python', topics: ['rag'] },
    { fork: false, language: 'TypeScript', topics: [] },
    { fork: true, language: 'Rust', topics: ['kopia'] },
    { fork: false, language: null },
    { fork: false, language: 'python', topics: ['ett-ämnesord-som-är-alldeles-för-långt'] },
  ];
  assert.deepEqual(forslagFranGithub(forrad), ['Python', 'rag', 'llm', 'TypeScript']);
  assert.deepEqual(forslagFranGithub(forrad, 2), ['Python', 'rag']);
  assert.deepEqual(forslagFranGithub([]), []);
});

test('en hämtad presentation blir en rad, eller ingenting', () => {
  assert.equal(somRubrik('  Bygger   agenter\nåt mindre bolag '), 'Bygger agenter åt mindre bolag');
  assert.equal(somRubrik(''), '');
  assert.equal(somRubrik('Se https://kim.se'), '');
  assert.equal(somRubrik('Född 850101-1234'), '');
  const lang = somRubrik('Bygger agenter och sökning åt mindre bolag som vill komma igång med språkmodeller utan att fastna i piloter som aldrig tar slut');
  assert.ok(lang.length <= 90 && !lang.endsWith(' '), lang);
  assert.ok('Bygger agenter och sökning åt mindre bolag som vill komma igång med språkmodeller utan att fastna'.startsWith(lang));
});

test('knappen heter som tjänsten', () => {
  assert.equal(lankEtikett('https://www.linkedin.com/in/kim'), 'LinkedIn');
  assert.equal(lankEtikett('https://se.linkedin.com/in/kim'), 'LinkedIn');
  assert.equal(lankEtikett('https://x.com/kim_e'), 'X');
  assert.equal(lankEtikett('https://github.com/kim-e'), 'GitHub');
  assert.equal(lankEtikett('https://kim.se/portfolio'), 'kim.se');
  assert.equal(lankEtikett('inte en adress'), 'Länk');
});

test('personnummer fångas, vanliga tal gör det inte', () => {
  assert.equal(harPersonnummer('850101-1234'), true);
  assert.equal(harPersonnummer('198501011234'), true);
  assert.equal(harPersonnummer('Bygger sedan 2019 åt 100 000 användare'), false);
});

test('klicket går via funktionen och slugen kodas', () => {
  assert.equal(klickUrl('kim-e-3f9a'), `${UPPDRAG_API}/k/kim-e-3f9a`);
  assert.equal(klickUrl('a/b'), `${UPPDRAG_API}/k/a%2Fb`);
});

test('en hand per kommun, och den som bara arbetar på distans syns inte på kartan', () => {
  const p = (slug, kommun) => ({ ...profil(slug), kommun });
  const grupper = perKommun([p('a', '0180'), p('b', null), p('c', '1480'), p('d', '0180')]);
  assert.deepEqual([...grupper.keys()], ['0180', '1480']);
  assert.deepEqual(grupper.get('0180').map((x) => x.slug), ['a', 'd']);
});

test('raden under namnet säger ort och distans, eller ingenting', () => {
  const kommuner = { 1480: 'Göteborg' };
  assert.equal(ortrad({ kommun: '1480', distans: true }, kommuner), 'Göteborg · distans');
  assert.equal(ortrad({ kommun: '1480', distans: false }, kommuner), 'Göteborg');
  assert.equal(ortrad({ kommun: null, distans: true }, kommuner), 'Distans');
  // En kommunkod kartan inte känner hoppas över.
  assert.equal(ortrad({ kommun: '9999', distans: false }, kommuner), '');
});


test('bildens adress går via funktionen och bara för ett giltigt namn', () => {
  const namn = '3f1c2a9e-1b2c-4d5e-8f90-0a1b2c3d4e5f.webp';
  assert.equal(bildUrl({ slug: 'kim-e-3f9a', bild: namn }), `${UPPDRAG_API}/b/kim-e-3f9a?v=${namn}`);
  assert.equal(bildUrl({ slug: 'kim-e-3f9a', bild: null }), null);
  assert.equal(bildUrl({ slug: 'kim-e-3f9a', bild: '../hemlig.webp' }), null);
  assert.equal(bildUrl({ slug: 'kim-e-3f9a', bild: 'f09' }), null);
});
