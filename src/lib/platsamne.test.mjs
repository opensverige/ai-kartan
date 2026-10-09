// Tester för sidorna om en plats och ett område, och för frågorna på platssidorna.
//   npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_NAMN, MAX_NAMN_I_MENING, amnesslug, amnesrubrik, amnesverb, gemen, platsled, platsamnen, namnlista, namnmening, raknade, platsfragor, faqSchema } from './platsamne.ts';

const post = (kommun, ...omraden) => ({ areas: { value: omraden }, kommun: { value: kommun } });
const flera = (antal, kommun, ...omraden) => Array.from({ length: antal }, () => post(kommun, ...omraden));

test('adressen byggs på områdets id, med bindestreck', () => {
  assert.equal(amnesslug('agenter_automation'), 'agenter-automation');
  assert.equal(amnesslug('halsa'), 'halsa');
});

test('bara första bokstaven görs liten, så att AI står kvar', () => {
  assert.equal(gemen('Generell AI'), 'generell AI');
  assert.equal(gemen('Hälsa och life science'), 'hälsa och life science');
});

test('en teknik står för sig själv, en bransch får AI inom framför', () => {
  assert.equal(amnesrubrik('datorseende', 'Datorseende'), 'Datorseende');
  assert.equal(amnesrubrik('halsa', 'Hälsa och life science'), 'AI inom hälsa och life science');
  assert.equal(amnesverb('generell', 'Generell AI'), 'arbetar med generell AI');
  assert.equal(amnesverb('juridik', 'Juridik'), 'bygger AI inom juridik');
});

test('ett område som inte är känt räknas som bransch', () => {
  assert.equal(amnesrubrik('rymd', 'Rymd'), 'AI inom rymd');
});

test('en kommun är ett säte, ett län en yta', () => {
  assert.equal(platsled('kommun', 'Lund'), 'med säte i Lund');
  assert.equal(platsled('lan', 'Skåne län'), 'i Skåne län');
});

test('en plats och ett område får en sida först vid minsta antalet', () => {
  const plats = { typ: 'kommun', organisationer: [...flera(5, '1281', 'datorseende', 'halsa'), ...flera(4, '1281', 'robotik')] };
  const sidor = platsamnen([plats]);
  assert.deepEqual(sidor.map((s) => s.omrade).sort(), ['datorseende', 'halsa']);
  assert.equal(sidor[0].organisationer.length, 5);
  assert.equal(platsamnen([plats], 4).length, 3);
});

test('ett län hoppas över när alla i området har säte i samma kommun', () => {
  const samma = { typ: 'lan', organisationer: flera(6, '0380', 'halsa') };
  const spridda = { typ: 'lan', organisationer: [...flera(5, '1280', 'halsa'), post('1281', 'halsa')] };
  assert.equal(platsamnen([samma]).length, 0);
  assert.equal(platsamnen([spridda]).length, 1);
});

test('alla namn står i meningen, eller inga: aldrig ett urval', () => {
  assert.equal(namnmening(['A', 'B', 'C']), 'De är A, B och C.');
  assert.equal(namnmening(Array.from({ length: MAX_NAMN_I_MENING + 1 }, (_, i) => `N${i}`)), null);
  assert.equal(namnmening([]), null);
});

test('namn med komma i sig skiljs åt med semikolon', () => {
  assert.equal(namnlista(['A', 'B', 'C']), 'A, B och C');
  assert.equal(namnlista(['DSV, Stockholms universitet', 'KTH']), 'DSV, Stockholms universitet och KTH');
  assert.equal(namnlista(['Digital Futures', 'DSV, Stockholms universitet', 'RPL, KTH']), 'Digital Futures; DSV, Stockholms universitet; och RPL, KTH');
});

test('antal räknas störst först, och lika många står i bokstavsordning', () => {
  assert.deepEqual(raknade(['b', 'a', 'c', 'c'], (id) => id), [['c', 2], ['a', 1], ['b', 1]]);
});

const underlag = {
  typ: 'kommun',
  namn: 'Göteborg',
  n: 39,
  typrad: '30 bolag och 9 lärosäten',
  omraden: [['Datorseende', 13], ['Agenter och automation', 12], ['Generell AI', 8]],
  erbjuder: [['Egen produkt', 30], ['Forskning', 5]],
  offentliga: [{ slag: 'larosate', plural: 'Lärosäten och forskningsmiljöer', namn: ['AI Sweden', 'Chalmers'] }],
  bekraftade: 37,
  senast: '8 okt 2026',
};

test('en plats med många organisationer får alla fem frågorna', () => {
  const fragor = platsfragor(underlag);
  assert.deepEqual(fragor.map((f) => f.nyckel), ['vilka', 'omraden', 'offentliga', 'erbjuder', 'kontroll']);
  assert.equal(fragor[0].svar, '39 organisationer med säte i Göteborg bygger AI: 30 bolag och 9 lärosäten.');
  assert.equal(fragor[1].svar, 'De vanligaste områdena i Göteborg är datorseende (13 organisationer), agenter och automation (12) och generell AI (8). En organisation kan ha flera områden.');
  assert.equal(fragor[2].fraga, 'Vilka lärosäten och forskningsmiljöer i Göteborg bygger AI?');
  assert.equal(fragor[2].svar, 'Lärosäten och forskningsmiljöer: AI Sweden och Chalmers.');
  assert.match(fragor[4].svar, /37 av 39 organisationer har minst ett fält bekräftat/);
  assert.match(fragor[4].svar, /Senast kontrollerad: 8 okt 2026\.$/);
});

test('en plats med en enda organisation får inga frågor om vad som är vanligast', () => {
  const fragor = platsfragor({ ...underlag, typ: 'kommun', namn: 'Falun', n: 1, typrad: '1 bolag', omraden: [['Robotik', 1]], erbjuder: [['Egen produkt', 1]], offentliga: [], bekraftade: 1 });
  assert.deepEqual(fragor.map((f) => f.nyckel), ['vilka', 'kontroll']);
  assert.equal(fragor[0].svar, '1 organisation med säte i Falun bygger AI: 1 bolag.');
  assert.match(fragor[1].svar, /1 av 1 organisation har minst ett fält/);
});

test('är namnen för många sägs antalet, så att ingen väljs ut', () => {
  const manga = Array.from({ length: MAX_NAMN + 1 }, (_, i) => `Myndighet ${i}`);
  const fragor = platsfragor({ ...underlag, offentliga: [{ slag: 'myndighet', plural: 'Myndigheter', namn: manga }] });
  const f = fragor.find((x) => x.nyckel === 'offentliga');
  assert.equal(f.fraga, 'Vilka myndigheter i Göteborg bygger AI?');
  assert.equal(f.svar, `Myndigheter: ${MAX_NAMN + 1} stycken.`);
});

test('frågan nämner bara de slag som finns på platsen', () => {
  const slag = (...vilka) => vilka.map((s) => ({ slag: s, plural: s, namn: ['A'] }));
  const fraga = (...vilka) => platsfragor({ ...underlag, offentliga: slag(...vilka) }).find((x) => x.nyckel === 'offentliga').fraga;
  assert.equal(fraga('kommun_region'), 'Vilka kommuner och regioner i Göteborg bygger AI?');
  assert.equal(fraga('larosate', 'kommun_region'), 'Vilka lärosäten och kommuner i Göteborg bygger AI?');
  assert.equal(fraga('larosate', 'myndighet', 'kommun_region'), 'Vilka lärosäten, myndigheter och kommuner i Göteborg bygger AI?');
});

test('ett län står utan säte i svaret', () => {
  assert.match(platsfragor({ ...underlag, typ: 'lan', namn: 'Skåne län' })[0].svar, /^39 organisationer i Skåne län bygger AI/);
});

test('den strukturerade datan bär samma text som sidan', () => {
  const fragor = platsfragor(underlag);
  const schema = faqSchema(fragor);
  assert.equal(schema['@type'], 'FAQPage');
  assert.equal(schema.mainEntity.length, fragor.length);
  assert.equal(schema.mainEntity[1].name, fragor[1].fraga);
  assert.equal(schema.mainEntity[1].acceptedAnswer.text, fragor[1].svar);
});
