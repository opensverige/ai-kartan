// Tester för kartans tre nivåer: län, kommuner och organisationerna själva.
//   npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import { nivaForZoom, platsmitt, grupperaPerPlats, zoomgranser, platsEfterUtzoomning, ZOOM_KOMMUN, ZOOM_POSTER } from './platsgrupper.ts';

const post = (id, k, kn, lat = 59.3, lng = 18.0) => ({ id, k, kn, l: k ? k.slice(0, 2) : null, ln: k ? `Län ${k.slice(0, 2)}` : null, lat, lng });
const STHLM = [post('a', '0180', 'Stockholm', 59.32, 18.06), post('b', '0180', 'Stockholm', 59.34, 18.08)];
const SOLNA = post('c', '0184', 'Solna', 59.36, 18.0);
const UMEA = post('d', '2480', 'Umeå', 63.83, 20.26);
const UTAN = { id: 'e', k: null, kn: null, l: null, ln: null, lat: null, lng: null };

test('nivån följer zoomen: län, sedan kommuner, sedan organisationerna', () => {
  assert.equal(nivaForZoom(4.5), 'lan');
  assert.equal(nivaForZoom(ZOOM_KOMMUN), 'kommun');
  assert.equal(nivaForZoom(ZOOM_POSTER - 0.01), 'kommun');
  assert.equal(nivaForZoom(ZOOM_POSTER), 'poster');
});

test('en plats med flera organisationer blir en grupp med namn och antal', () => {
  const alla = [...STHLM, SOLNA, UMEA];
  const { grupper } = grupperaPerPlats(alla, 'kommun', platsmitt(alla, 'kommun'));
  assert.deepEqual(grupper.map((g) => [g.kod, g.namn, g.antal]), [['0180', 'Stockholm', 2]]);
});

test('en organisation som är ensam på sin plats ritas som sig själv', () => {
  const alla = [...STHLM, SOLNA, UMEA];
  const { ensamma } = grupperaPerPlats(alla, 'kommun', platsmitt(alla, 'kommun'));
  assert.deepEqual([...ensamma].sort(), ['c', 'd']);
});

test('på länsnivå räknas kommunerna i samma län ihop', () => {
  const alla = [...STHLM, SOLNA, UMEA];
  const { grupper, ensamma } = grupperaPerPlats(alla, 'lan', platsmitt(alla, 'lan'));
  assert.deepEqual(grupper.map((g) => [g.kod, g.namn, g.antal]), [['01', 'Län 01', 3]]);
  assert.deepEqual([...ensamma], ['d']);
});

test('gruppen ligger still när urvalet krymper, eftersom mittpunkten räknas på alla', () => {
  const alla = [...STHLM, post('f', '0180', 'Stockholm', 59.3, 18.1)];
  const mitt = platsmitt(alla, 'kommun');
  const hela = grupperaPerPlats(alla, 'kommun', mitt).grupper[0];
  const urval = grupperaPerPlats(STHLM, 'kommun', mitt).grupper[0];
  assert.deepEqual([urval.lng, urval.lat], [hela.lng, hela.lat]);
  assert.equal(urval.antal, 2);
});

test('organisationer utan plats hamnar varken i en grupp eller bland de ensamma', () => {
  const { grupper, ensamma } = grupperaPerPlats([UTAN, UMEA], 'kommun', platsmitt([UTAN, UMEA], 'kommun'));
  assert.equal(grupper.length, 0);
  assert.deepEqual([...ensamma], ['d']);
});

test('största gruppen kommer först, så att den ritas underst och får namnet först', () => {
  const alla = [SOLNA, post('g', '0184', 'Solna'), ...STHLM, post('h', '0180', 'Stockholm')];
  const { grupper } = grupperaPerPlats(alla, 'kommun', platsmitt(alla, 'kommun'));
  assert.deepEqual(grupper.map((g) => g.kod), ['0180', '0184']);
});

test('ett urval i en enda kommun zoomas in tills organisationerna syns', () => {
  const [min, max] = zoomgranser(STHLM);
  assert.ok(min >= ZOOM_POSTER, 'lägsta zoom ska ligga på nivån där organisationerna ritas');
  assert.ok(max > min);
});

test('ett urval över flera kommuner stannar på kommunnivån', () => {
  const [min, max] = zoomgranser([...STHLM, SOLNA]);
  assert.ok(min >= ZOOM_KOMMUN && max < ZOOM_POSTER);
});

test('den som zoomar ut under kommunnivån lämnar kommunen men är kvar i länet', () => {
  assert.deepEqual(platsEfterUtzoomning(ZOOM_POSTER - 3, { lan: '01', kommun: '0180' }), { lan: '01', kommun: '' });
});

test('den som zoomar ut till hela landet lämnar länet', () => {
  assert.deepEqual(platsEfterUtzoomning(4.5, { lan: '01', kommun: '0180' }), { lan: '', kommun: '' });
  assert.deepEqual(platsEfterUtzoomning(4.5, { lan: '01', kommun: '' }), { lan: '', kommun: '' });
});

test('en liten utzoomning ändrar inte platsen', () => {
  const plats = { lan: '01', kommun: '0180' };
  assert.deepEqual(platsEfterUtzoomning(ZOOM_POSTER - 0.5, plats), plats);
  assert.deepEqual(platsEfterUtzoomning(ZOOM_KOMMUN + 1, { lan: '01', kommun: '' }), { lan: '01', kommun: '' });
});
