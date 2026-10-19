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
  erbjuder: { infrastruktur: 'Infrastruktur och hosting', oppen_kallkod: 'Öppen källkod', produkt: 'Egen produkt' },
  omraden: {
    datorseende: 'Datorseende',
    halsa: 'Hälsa och life science',
    robotik: 'Robotik',
    agenter_automation: 'Agenter och automation',
    offentlig_sektor: 'Offentlig sektor',
    generell: 'Generell AI',
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

test('modellfel säger varför modellen inte svarade, och svaret kommer ändå', async () => {
  const { modellfel } = await import('./inferens.ts');
  const kastar = (sort) => async () => {
    throw modellfel(sort);
  };
  const slut = await svara('voice', [], DATA, kastar('slut'), '2026-10-19');
  assert.equal(slut.modellfel, 'slut');
  assert.equal(slut.utanModell, true);
  assert.ok(slut.ids.includes('rosthuset'));
  assert.equal((await svara('voice', [], DATA, kastar('tidsgrans'), '2026-10-19')).modellfel, 'tidsgrans');
  assert.equal((await svara('voice', [], DATA, async () => { throw new Error('okänt'); }, '2026-10-19')).modellfel, 'nere');
  assert.equal((await svara('voice', [], DATA, null, '2026-10-19')).modellfel, 'saknas');
});

test('modellfel är null när modellen svarade eller inte behövdes', async () => {
  assert.equal((await svara('voice', [], DATA, stub(modell({ sokord: ['röst'] })), '2026-10-19')).modellfel, null);
  assert.equal((await svara('Vilket är det bästa bolaget?', [], DATA, null, '2026-10-19')).modellfel, null);
});

test('modellens sökord rensas från verb och utfyllnad, så en bred fråga förblir bred', async () => {
  assert.equal((await kor('Hitta mig alla som arbetar med AI', stub(modell({ sokord: ['arbeta'] })))).sort, 'bred');
  assert.equal((await kor('Vilka bygger röst?', stub(modell({ sokord: ['bygga', 'röst'] })))).filter.q, 'röst');
});

test('generell, bolag och egen produkt gäller bara när frågan säger dem', async () => {
  const bred = await kor('Hitta mig alla som arbetar med AI', stub(modell({ omrade: ['generell'], tolkning: 'Jag tolkar det som att du söker människor som arbetar med generell AI.' })));
  assert.equal(bred.sort, 'bred');
  const tomt = await kor('Vilka bygger kvantdatorer?', stub(modell({ omrade: ['generell'], erbjuder: ['produkt'], typ: ['bolag'], sokord: ['kvantdatorer'] })));
  assert.equal(tomt.sort, 'tomt');
  assert.deepEqual([tomt.filter.typ, tomt.filter.erbjuder, tomt.filter.omrade], [[], [], []]);
  const bolag = await kor('Vilka bolag bygger robotar?', stub(modell({ typ: ['bolag'], omrade: ['robotik'] })));
  assert.deepEqual(bolag.filter.typ, ['bolag']);
  const foretag = await kor('Företag med egen produkt inom robotik', stub(modell({ typ: ['bolag'], erbjuder: ['produkt'], omrade: ['robotik'] })));
  assert.deepEqual([foretag.filter.typ, foretag.filter.erbjuder], [['bolag'], ['produkt']]);
  const generell = await kor('Generell AI i Stockholm', stub(modell({ omrade: ['generell'] })));
  assert.deepEqual(generell.filter.omrade, ['generell']);
});

test('när koden tar bort en gissad facett skrivs tolkningsraden av mallen', async () => {
  const svar = await kor('Vilka bygger robotar?', stub(modell({ typ: ['bolag'], omrade: ['robotik'], tolkning: 'Jag tolkar det som att du söker bolag inom robotik.' })));
  assert.deepEqual(svar.filter.typ, []);
  assert.equal(svar.tolkning, 'Jag tolkar det som att du söker organisationer inom robotik.');
});

test('ett tomt filter blir bara Discord-svar när frågan säger att den gäller människor', async () => {
  assert.equal((await kor('Hitta mig alla som arbetar med AI', stub(modell({ manniska: true })))).sort, 'bred');
  assert.equal((await kor('Hitta mig alla som arbetar med AI', stub(modell({ avsikt: 'manniska' })))).sort, 'bred');
  assert.equal((await kor('Var kan jag bolla en idé med builders?', stub(modell({ manniska: true })))).sort, 'manniska');
});

test('Sverige som plats är hela landet, inte en okänd plats', async () => {
  for (const plats of ['Sverige', 'hela Sverige', 'Sweden']) {
    const svar = await kor('Jag behöver GPU-kapacitet i Sverige', stub(modell({ erbjuder: ['infrastruktur'], plats })));
    assert.equal(svar.okandPlats, null, plats);
    assert.equal(svar.filter.lan, '', plats);
    assert.deepEqual(svar.ids, ['molnet'], plats);
  }
});

test('en fråga om människor utan träffar får Discord-svaret, inte Inga träffar', async () => {
  const svar = await kor('Var kan jag bolla en idé med builders?', stub(modell({ sokord: ['idé', 'builders'], manniska: true })));
  assert.equal(svar.sort, 'manniska');
  const tomt = await kor('Vilka bygger kvantdatorer?', stub(modell({ sokord: ['kvantdatorer'] })));
  assert.equal(tomt.sort, 'tomt');
});
