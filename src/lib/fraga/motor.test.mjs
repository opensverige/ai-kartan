// Tester för motorn: från fråga till svar, med och utan modell.
//   node --test src/lib/fraga/motor.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { TOMT_FILTER, filterTillSok } from '../filter.ts';
import { tillSokpost } from '../sokindex.ts';
import { svara } from './motor.ts';

const ETIKETTER = {
  typer: { bolag: 'Bolag', myndighet: 'Myndighet' },
  typerPlural: { bolag: 'Bolag', myndighet: 'Myndigheter' },
  erbjuder: { infrastruktur: 'Infrastruktur och hosting', oppen_kallkod: 'Öppen källkod' },
  omraden: {
    datorseende: 'Datorseende',
    halsa: 'Hälsa och life science',
    robotik: 'Robotik',
    agenter_automation: 'Agenter och automation',
    offentlig_sektor: 'Offentlig sektor',
  },
  lan: {},
};

const KOMMUNER = [
  { kod: '2480', namn: 'Umeå' },
  { kod: '0180', namn: 'Stockholm' },
  { kod: '1480', namn: 'Göteborg' },
];
const LAN = [
  { kod: '24', namn: 'Västerbottens län' },
  { kod: '01', namn: 'Stockholms län' },
  { kod: '14', namn: 'Västra Götalands län' },
];
const FAQ_IDS = ['vad-ar-opensverige', 'bidra', 'kostnad'];
const IDAG = '2026-10-19';

const umea = { k: '2480', kn: 'Umeå', l: '24', ln: 'Västerbottens län' };
const stockholm = { k: '0180', kn: 'Stockholm', l: '01', ln: 'Stockholms län' };
const goteborg = { k: '1480', kn: 'Göteborg', l: '14', ln: 'Västra Götalands län' };

const post = (id, n, d, extra = {}) => tillSokpost({ id, n, d, t: 'bolag', o: [], a: [], k: null, kn: null, l: null, ln: null, ...extra }, ETIKETTER);

const POSTER = [
  post('synbolaget', 'Synbolaget', 'Bygger datorseende för skog.', { a: ['datorseende'], ...umea }),
  post('synlabbet', 'Synlabbet', 'Analyserar bilder.', { a: ['datorseende'], ...stockholm }),
  post('molnet', 'Molnet', 'Hyr ut GPU-kapacitet.', { o: ['infrastruktur'], ...stockholm }),
  post('rosthuset', 'Rösthuset', 'Bygger röstagenter för kundtjänst.', { ...goteborg }),
  post('talverket', 'Talverket', 'Säljer TTS för svenska.', { ...stockholm }),
  post('halsobolaget', 'Hälsobolaget', 'Tolkar journaler.', { a: ['halsa'], ...goteborg }),
  post('kodverket', 'Kodverket', 'Öppna agentramverk.', { o: ['oppen_kallkod'], a: ['agenter_automation'], ...stockholm }),
  post('myndigheten', 'Myndigheten', 'Handlägger ärenden.', { t: 'myndighet', a: ['offentlig_sektor'], ...stockholm }),
  ...Array.from({ length: 7 }, (_, i) => post(`robot${i + 1}`, `Robot ${i + 1}`, 'Bygger robotar.', { a: ['robotik'], ...stockholm })),
];

const DATA = { poster: POSTER, etiketter: ETIKETTER, faqIds: FAQ_IDS, kommuner: KOMMUNER, lan: LAN };

const GRUND = {
  avsikt: 'hitta',
  omrade: [],
  erbjuder: [],
  typ: [],
  plats: '',
  sokord: [],
  faq: [],
  manniska: false,
  tolkning: '',
};
const modell = (delar) => ({ ...GRUND, ...delar });
const stub = (m) => async () => m;
const kor = (fraga, tolkare) => svara(fraga, [], DATA, tolkare, IDAG);

test('område och län ger träffen, kartlänken och skälen', async () => {
  const svar = await kor('Datorseende i Västerbotten', stub(modell({ omrade: ['datorseende'], plats: 'Västerbotten' })));
  assert.equal(svar.sort, 'traffar');
  assert.deepEqual(svar.ids, ['synbolaget']);
  assert.equal(svar.kartlank, '/?omrade=datorseende&lan=24');
  assert.deepEqual(svar.skal.synbolaget, ['område Datorseende', 'Västerbottens län']);
});

test('sökord som inte träffar tas bort och mallraden ersätter modellens mening', async () => {
  const svar = await kor(
    'Känslig infrastruktur',
    stub(modell({ erbjuder: ['infrastruktur'], sokord: ['känsliga'], tolkning: 'Jag tolkar det som att du söker känslig infrastruktur.' })),
  );
  assert.equal(svar.sort, 'traffar');
  assert.deepEqual(svar.ids, ['molnet']);
  assert.deepEqual(svar.borttaget, ['känsliga']);
  assert.equal(svar.tolkning, 'Jag tolkar det som att du söker organisationer som erbjuder infrastruktur och hosting.');
});

test('ett tomt filter är en bred fråga', async () => {
  const svar = await kor('Hej', stub(modell({})));
  assert.equal(svar.sort, 'bred');
});

test('utan modell blir en fråga utan bärande ord bred', async () => {
  const svar = await kor('Hitta mig alla som arbetar med AI', null);
  assert.equal(svar.sort, 'bred');
  assert.equal(svar.utanModell, true);
});

test('utan modell söker karnorden och länken använder samma filter', async () => {
  const svar = await kor('Vilka bygger röstagenter i Göteborg?', null);
  assert.deepEqual(svar.ids, ['rosthuset']);
  assert.equal(svar.kartlank, `/?${filterTillSok({ ...TOMT_FILTER, q: 'röstagenter Göteborg' })}`);
});

test('utan modell hittar voice både röst och tts', async () => {
  const svar = await kor('voice', null);
  assert.ok(svar.ids.includes('rosthuset'));
  assert.ok(svar.ids.includes('talverket'));
});

test('en tolkare som kastar ger samma träffar som utan modell', async () => {
  const utan = await kor('voice', null);
  const svar = await kor('voice', async () => {
    throw new Error('nere');
  });
  assert.deepEqual(svar.ids, utan.ids);
  assert.equal(svar.utanModell, true);
});

test('ranking stoppas innan tolkaren anropas', async () => {
  let anrop = 0;
  const svar = await kor('Vilket är det bästa bolaget?', async () => {
    anrop += 1;
    return modell({});
  });
  assert.equal(svar.sort, 'ranking');
  assert.equal(anrop, 0);
});

test('en mening som rankar byts mot mallen', async () => {
  const svar = await kor('Inom hälsa', stub(modell({ omrade: ['halsa'], tolkning: 'Här är Sveriges ledande bolag.' })));
  assert.equal(svar.tolkning, 'Jag tolkar det som att du söker organisationer inom hälsa och life science.');
});

test('en godkänd mening från modellen behålls', async () => {
  const rad = 'Jag tolkar det som att du söker organisationer inom hälsa.';
  const svar = await kor('Inom hälsa', stub(modell({ omrade: ['halsa'], tolkning: rad })));
  assert.equal(svar.tolkning, rad);
});

test('opensverige behåller kända faq-id och fyller på när listan blir tom', async () => {
  const kand = await kor('Vad är OpenSverige?', stub(modell({ avsikt: 'opensverige', faq: ['bidra'] })));
  assert.equal(kand.sort, 'opensverige');
  assert.deepEqual(kand.faq, ['bidra']);

  const tom = await kor('Vad kostar det att vara medlem?', stub(modell({ avsikt: 'opensverige', faq: ['finns-inte'] })));
  assert.ok(tom.faq.includes('kostnad'));
});

test('en träff kan gälla en människa att bolla med', async () => {
  const svar = await kor('Bolag inom hälsa', stub(modell({ omrade: ['halsa'], manniska: true })));
  assert.equal(svar.sort, 'traffar');
  assert.equal(svar.manniska, true);
});

test('en okänd plats ignoreras och båda träffarna blir kvar', async () => {
  const svar = await kor('Datorseende i Norrland', stub(modell({ omrade: ['datorseende'], plats: 'Norrland' })));
  assert.equal(svar.okandPlats, 'Norrland');
  assert.equal(svar.filter.lan, '');
  assert.equal(svar.filter.kommun, '');
  assert.ok(svar.ids.includes('synbolaget'));
  assert.ok(svar.ids.includes('synlabbet'));
});

test('kontakt från modellen ger ett fast svar utan träffar', async () => {
  const svar = await kor('Kan du hjälpa mig?', stub(modell({ avsikt: 'kontakt' })));
  assert.equal(svar.sort, 'kontakt');
  assert.deepEqual(svar.ids, []);
});

test('fler än fem visas som samma dagliga urval i namnordning', async () => {
  const tolkare = stub(modell({ omrade: ['robotik'] }));
  const svar = await kor('Robotik', tolkare);
  const namn = Object.fromEntries(POSTER.map((p) => [p.id, p.n]));
  const jamfor = (a, b) => namn[a].localeCompare(namn[b], 'sv');
  assert.equal(svar.totalt, 7);
  assert.equal(svar.visade.length, 5);
  assert.equal(svar.regel, 'dagligt');
  assert.deepEqual(svar.visade, [...svar.visade].sort(jamfor));
  const igen = await kor('Robotik', tolkare);
  assert.deepEqual(igen.visade, svar.visade);
});

test('facetter utan sökord ger tomt och inget tas bort', async () => {
  const svar = await kor('Robotik hos en myndighet', stub(modell({ omrade: ['robotik'], typ: ['myndighet'] })));
  assert.equal(svar.sort, 'tomt');
  assert.deepEqual(svar.borttaget, []);
});

test('kommunen sätter länet och en post i en annan stad ger tomt', async () => {
  const svar = await kor(
    'Öppen källkod i Göteborg',
    stub(modell({ erbjuder: ['oppen_kallkod'], omrade: ['agenter_automation'], plats: 'Göteborg' })),
  );
  assert.equal(svar.filter.kommun, '1480');
  assert.equal(svar.filter.lan, '14');
  assert.equal(svar.sort, 'tomt');
});
