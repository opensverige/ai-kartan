// Tester för frågestatistiken: fönster och luckor, vilka rader som räknas och att inget annat än antal kommer ut.
//   npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FORDROJNING_MS,
  LAGRING_MS,
  MAX_RADER,
  fonster,
  lasLoggar,
  lasLoggrad,
  laggTill,
  avrunda,
  forloratTillstand,
  forsegla,
  oppna,
  publicera,
  rapport,
  svenskDag,
  tomPublicering,
  tomtTillstand,
} from './lib/fragestatistik.mjs';

const NU = Date.parse('2026-10-20T12:00:00Z');
const AMNE = { omrade: ['halsa'], typ: [], erbjuder: [], lan: '12' };

function logg(tid, rad, andra = {}) {
  return { requestPath: '/api/fraga', timestamp: tid, message: JSON.stringify(rad), ...andra };
}
const svar = (andra = {}) => ({ sort: 'traffar', ms: 900, utanModell: false, modellfel: null, amne: AMNE, ...andra });

test('dagen räknas i svensk tid, även kring sommartidens slut', () => {
  assert.equal(svenskDag(Date.parse('2026-10-20T21:59:00Z')), '2026-10-20');
  assert.equal(svenskDag(Date.parse('2026-10-20T22:01:00Z')), '2026-10-21');
  assert.equal(svenskDag(Date.parse('2026-10-25T22:30:00Z')), '2026-10-25');
  assert.equal(svenskDag(Date.parse('2026-10-25T23:30:00Z')), '2026-10-26');
});

test('fönstret börjar vid markören och slutar strax före nu', () => {
  const markor = new Date(NU - 15 * 60 * 1000).toISOString();
  assert.deepEqual(fonster(markor, NU), { fran: Date.parse(markor), till: NU - FORDROJNING_MS, lucka: null });
});

test('första körningen börjar där loggen börjar, utan lucka', () => {
  assert.deepEqual(fonster(null, NU), { fran: NU - LAGRING_MS, till: NU - FORDROJNING_MS, lucka: null });
});

test('en markör äldre än loggen ger en lucka', () => {
  const markor = new Date(NU - 3 * 60 * 60 * 1000).toISOString();
  const f = fonster(markor, NU);
  assert.equal(f.fran, NU - LAGRING_MS);
  assert.deepEqual(f.lucka, { fran: markor, till: new Date(NU - LAGRING_MS).toISOString(), orsak: 'lagring' });
});

test('bara Fråga kartans rader i rätt form räknas', () => {
  assert.ok(lasLoggrad(logg(NU, svar())));
  assert.equal(lasLoggrad({ ...logg(NU, svar()), requestPath: '/api/data' }), null);
  assert.equal(lasLoggrad({ ...logg(NU, svar()), timestamp: 'igår' }), null);
  assert.equal(lasLoggrad({ requestPath: '/api/fraga', timestamp: NU, message: 'inte json' }), null);
  assert.equal(lasLoggrad(logg(NU, svar({ sort: 'okand' }))), null);
  assert.equal(lasLoggrad(logg(NU, svar({ modellfel: 'påhittat' }))), null);
});

test('fritext i ämnet stoppar hela raden', () => {
  assert.equal(lasLoggrad(logg(NU, svar({ amne: { ...AMNE, omrade: ['Hemlig fråga om hälsa'] } }))), null);
  assert.equal(lasLoggrad(logg(NU, svar({ amne: { ...AMNE, lan: 'Skåne' } }))), null);
  assert.equal(lasLoggrad(logg(NU, svar({ amne: { ...AMNE, typ: 'bolag' } }))), null);
});

test('rader från före ämnet räknas, utan ämne', () => {
  const { amne, ...gammal } = svar();
  assert.equal(lasLoggrad(logg(NU, gammal)).amne, null);
});

test('loggens text kan innehålla vad som helst utan att något läcker', () => {
  const text = ['inte json alls', JSON.stringify(logg(NU, svar())), JSON.stringify({ requestPath: '/api/fraga', message: 'Hemlig', timestamp: NU }), ''].join('\n');
  const { rader, kastade, totalt } = lasLoggar(text);
  assert.equal(rader.length, 1);
  assert.equal(kastade, 2);
  assert.equal(totalt, 3);
  assert.ok(!JSON.stringify(rader).includes('Hemlig'));
});

test('varje dimension räknas för sig, och modellens svar räknas', () => {
  const f = { fran: NU - 600000, till: NU, lucka: null };
  const rader = [
    lasLoggrad(logg(NU - 1000, svar())),
    lasLoggrad(logg(NU - 2000, svar({ utanModell: true, modellfel: 'tidsgrans', amne: { omrade: ['halsa', 'sprak'], typ: ['bolag'], erbjuder: [], lan: null } }))),
    lasLoggrad(logg(NU - 3000, svar({ sort: 'tomt', amne: null }))),
  ];
  const { tillstand: statistik } = laggTill(tomtTillstand(), rader, f, rader.length);
  assert.deepEqual(statistik.dagar['2026-10-20'], {
    fragor: 3,
    modellen_svarade: 2,
    svar: { traffar: 2, tomt: 1 },
    modellfel: { tidsgrans: 1 },
    omrade: { halsa: 2, sprak: 1 },
    typ: { bolag: 1 },
    erbjuder: {},
    lan: { '12': 1 },
  });
  assert.equal(statistik.markor, new Date(NU).toISOString());
  assert.equal(statistik.start, new Date(NU - 600000).toISOString());
});

test('två körningar räknar aldrig samma rad', () => {
  const rad = lasLoggrad(logg(NU - 60000, svar()));
  const forsta = laggTill(tomtTillstand(), [rad], { fran: NU - 600000, till: NU, lucka: null }, 1).tillstand;
  const andra = laggTill(forsta, [rad], { fran: NU, till: NU + 600000, lucka: null }, 1).tillstand;
  assert.equal(andra.dagar['2026-10-20'].fragor, 1);
});

test('ett larmfel larmar en gång per dag, ett tillfälligt fel aldrig', () => {
  const f = { fran: NU - 600000, till: NU, lucka: null };
  const rader = ['tak', 'tak', 'tidsgrans', 'slut'].map((m, i) => lasLoggrad(logg(NU - 1000 * (i + 1), svar({ utanModell: true, modellfel: m }))));
  const forsta = laggTill(tomtTillstand(), rader, f, rader.length);
  assert.deepEqual(forsta.nyaLarm.map((l) => l.modellfel).sort(), ['slut', 'tak']);
  const tak = [lasLoggrad(logg(NU + 1000, svar({ utanModell: true, modellfel: 'tak' })))];
  const andra = laggTill(forsta.tillstand, tak, { fran: NU, till: NU + 600000, lucka: null }, 1);
  assert.deepEqual(andra.nyaLarm, []);
});

test('luckor sparas och syns som nya', () => {
  const lucka = { fran: '2026-10-20T08:00:00.000Z', till: '2026-10-20T11:05:00.000Z', orsak: 'lagring' };
  const { tillstand: statistik, nyaLuckor } = laggTill(tomtTillstand(), [], { fran: NU - 600000, till: NU, lucka }, MAX_RADER);
  assert.equal(statistik.luckor.length, 2);
  assert.deepEqual(nyaLuckor.map((l) => l.orsak), ['lagring', 'for-manga-rader']);
});

test('luckor larmar en gång per dag men sparas alla', () => {
  const lucka = (h) => ({ fran: `2026-10-20T0${h}:00:00.000Z`, till: `2026-10-20T0${h}:30:00.000Z`, orsak: 'lagring' });
  const forsta = laggTill(tomtTillstand(), [], { fran: NU - 600000, till: NU, lucka: lucka(1) }, 0);
  assert.equal(forsta.nyaLarm.length, 1);
  const andra = laggTill(forsta.tillstand, [], { fran: NU, till: NU + 600000, lucka: lucka(2) }, 0);
  assert.deepEqual(andra.nyaLarm, []);
  assert.equal(andra.tillstand.luckor.length, 2);
  assert.match(rapport({ fran: NU, till: NU + 600000 }, 0, forsta.nyaLarm, forsta.nyaLuckor), /Lucka för första gången 2026-10-20/);
});

test('rapporten säger inte hur många som frågade, bara fel och luckor', () => {
  const f = { fran: NU - 600000, till: NU, lucka: null };
  const rader = [lasLoggrad(logg(NU - 1000, svar({ modellfel: 'slut', utanModell: true })))];
  const { nyaLarm, nyaLuckor } = laggTill(tomtTillstand(), rader, f, 1);
  const text = rapport(f, 0, nyaLarm, nyaLuckor);
  assert.match(text, /Modellfel slut/);
  assert.ok(!/Frågor/.test(text));
  assert.ok(!text.includes('halsa'));
});

test('ämnen under tröskeln blir övrigt, totalen och felen står kvar', () => {
  const dag = { fragor: 5, modellen_svarade: 4, svar: { traffar: 4, tomt: 1 }, modellfel: { tak: 1 }, omrade: { halsa: 3, sprak: 1, juridik: 1 }, typ: { bolag: 2 }, erbjuder: {}, lan: { '12': 4, '01': 1 } };
  assert.deepEqual(avrunda(dag), {
    fragor: 5,
    modellen_svarade: 4,
    svar: { traffar: 4, tomt: 1 },
    modellfel: { tak: 1 },
    omrade: { halsa: 3, ovrigt: 2 },
    typ: { ovrigt: 2 },
    erbjuder: {},
    lan: { '12': 4, ovrigt: 1 },
  });
});

test('dagen som pågår publiceras inte', () => {
  const rader = [1, 2, 3].map((i) => lasLoggrad(logg(NU - i * 1000, svar())));
  const { tillstand } = laggTill(tomtTillstand(), rader, { fran: NU - 600000, till: NU, lucka: null }, 3);
  const ut = publicera(tillstand, tomPublicering());
  assert.deepEqual(ut.publicering.dagar, {});
  assert.equal(ut.andrad, false);
  assert.equal(ut.tillstand.dagar['2026-10-20'].fragor, 3);
});

test('en dag publiceras först när markören har passerat midnatt', () => {
  const kvall = Date.parse('2026-10-20T21:50:00Z');
  const rader = [1, 2, 3].map((i) => lasLoggrad(logg(kvall + i * 1000, svar())));
  const fore = laggTill(tomtTillstand(), rader, { fran: kvall, till: Date.parse('2026-10-20T21:59:00Z'), lucka: null }, 3).tillstand;
  assert.equal(publicera(fore, tomPublicering()).andrad, false);
  const efter = laggTill(fore, [], { fran: Date.parse('2026-10-20T21:59:00Z'), till: Date.parse('2026-10-20T22:05:00Z'), lucka: null }, 0).tillstand;
  const ut = publicera(efter, tomPublicering());
  assert.equal(ut.andrad, true);
  assert.deepEqual(ut.publicering.dagar['2026-10-20'].omrade, { halsa: 3 });
  assert.deepEqual(ut.publicering.dagar['2026-10-20'].lan, { '12': 3 });
  assert.deepEqual(ut.tillstand.dagar, {});
  assert.equal(ut.publicering.start, fore.start);
});

test('en ensam fråga syns inte med sitt ämne', () => {
  const kvall = Date.parse('2026-10-20T20:00:00Z');
  const t = laggTill(tomtTillstand(), [lasLoggrad(logg(kvall, svar()))], { fran: kvall - 1000, till: Date.parse('2026-10-20T22:10:00Z'), lucka: null }, 1).tillstand;
  const dag = publicera(t, tomPublicering()).publicering.dagar['2026-10-20'];
  assert.equal(dag.fragor, 1);
  assert.deepEqual(dag.omrade, { ovrigt: 1 });
  assert.deepEqual(dag.lan, { ovrigt: 1 });
});

test('förlorat tillstånd ger en lucka bara när statistiken har börjat', () => {
  assert.equal(forloratTillstand(tomPublicering(), NU).lucka, null);
  const { tillstand, lucka } = forloratTillstand({ ...tomPublicering(), start: '2026-10-19T10:00:00.000Z' }, NU);
  assert.equal(tillstand.start, '2026-10-19T10:00:00.000Z');
  assert.deepEqual(lucka, { fran: null, till: new Date(NU - LAGRING_MS).toISOString(), orsak: 'tillstand-saknas' });
  const { nyaLarm } = laggTill(tillstand, [], { fran: NU - LAGRING_MS, till: NU, lucka }, 0);
  assert.equal(nyaLarm.length, 1);
});

test('tillståndet går bara att öppna med samma token', () => {
  const t = { ...tomtTillstand(), dagar: { '2026-10-20': { fragor: 2 } } };
  const forseglat = forsegla(t, 'ratt-token');
  assert.ok(!JSON.stringify(forseglat).includes('fragor'));
  assert.deepEqual(oppna(forseglat, 'ratt-token'), t);
  assert.equal(oppna(forseglat, 'fel-token'), null);
  assert.equal(oppna({ v: 1, iv: 'x', tag: 'y', data: 'z' }, 'ratt-token'), null);
});
