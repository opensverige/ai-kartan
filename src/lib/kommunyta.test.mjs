// Tester för kommunytan: det mjuka området som ritas runt organisationerna i en kommun, så att
// prickarna inte läses som adresser.
//   npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import { ytkant, kommunytor } from './kommunyta.ts';

const MITT = { lat: 59.33, lng: 18.07 };
const METER = 111320;
/** Punkten `ost` och `norr` meter från mitten. */
const pa = (ost, norr) => ({ lat: MITT.lat + norr / METER, lng: MITT.lng + ost / (METER * Math.cos((MITT.lat * Math.PI) / 180)) });
/** [öst, norr] i meter från mitten för en punkt på kanten, som står som [lng, lat]. */
const iMeter = ([lng, lat]) => [(lng - MITT.lng) * METER * Math.cos((MITT.lat * Math.PI) / 180), (lat - MITT.lat) * METER];
const tillStracka = ([px, py], [ax, ay], [bx, by]) => {
  const dx = bx - ax;
  const dy = by - ay;
  const t = dx || dy ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};
const nara = (tal, mal, tolerans, vad) => assert.ok(Math.abs(tal - mal) <= tolerans, `${vad}: ${tal.toFixed(1)} ska vara ${mal} ± ${tolerans}`);

test('en ensam organisation får en rund yta med marginalen som radie', () => {
  const kant = ytkant([MITT], 300);
  assert.ok(kant.length > 12, 'rund nog att inte se kantig ut');
  for (const p of kant) nara(Math.hypot(...iMeter(p)), 300, 3, 'avstånd från punkten');
});

test('kanten är en sluten ring, som GeoJSON kräver', () => {
  const kant = ytkant([pa(0, 0), pa(400, 0), pa(200, 300)], 250);
  assert.deepEqual(kant[0], kant.at(-1));
});

test('två organisationer får en kapsel runt sträckan mellan dem', () => {
  const kant = ytkant([pa(-300, 0), pa(300, 0)], 250);
  for (const p of kant) nara(tillStracka(iMeter(p), [-300, 0], [300, 0]), 250, 3, 'avstånd från sträckan');
});

test('varje organisation ligger innanför kanten med hela marginalen till godo', () => {
  const punkter = [pa(0, 0), pa(220, 0), pa(110, 190), pa(-220, 0), pa(-110, -190), pa(440, 380), pa(-660, 190)];
  const kant = ytkant(punkter, 260).map(iMeter);
  for (const punkt of punkter) {
    const p = iMeter([punkt.lng, punkt.lat]);
    const narmast = Math.min(...kant.slice(1).map((b, i) => tillStracka(p, kant[i], b)));
    assert.ok(narmast >= 257, `punkten ligger ${narmast.toFixed(1)} m från kanten`);
  }
});

test('kanten buktar aldrig inåt', () => {
  const kant = ytkant([pa(0, 0), pa(500, 100), pa(300, 600), pa(-200, 400), pa(100, 250)], 200).map(iMeter);
  for (let i = 0; i < kant.length - 2; i++) {
    const [ax, ay] = kant[i];
    const [bx, by] = kant[i + 1];
    const [cx, cy] = kant[i + 2];
    assert.ok((bx - ax) * (cy - by) - (by - ay) * (cx - bx) >= -1, `inbuktning vid punkt ${i + 1}`);
  }
});

test('samma organisationer i annan ordning ger samma yta', () => {
  const punkter = [pa(0, 0), pa(500, 100), pa(300, 600), pa(-200, 400)];
  assert.deepEqual(ytkant([...punkter].reverse(), 200), ytkant(punkter, 200));
});

const post = (id, k, kn, punkt, pt = 'kommun') => ({ id, k, kn, lat: punkt?.lat ?? null, lng: punkt?.lng ?? null, pt });

test('varje kommun får en yta med namn och antal', () => {
  const ytor = kommunytor([post('a', '0180', 'Stockholm', pa(0, 0)), post('b', '0180', 'Stockholm', pa(220, 0)), post('c', '1480', 'Göteborg', pa(9000, 0))]);
  assert.deepEqual(
    ytor.map((y) => [y.kod, y.namn, y.antal]),
    [
      ['0180', 'Stockholm', 2],
      ['1480', 'Göteborg', 1],
    ],
  );
});

test('en organisation med exakt position hör inte till ytan och drar inte ut den', () => {
  const utan = kommunytor([post('a', '0180', 'Stockholm', pa(0, 0)), post('b', '0180', 'Stockholm', pa(220, 0))]);
  const med = kommunytor([post('a', '0180', 'Stockholm', pa(0, 0)), post('b', '0180', 'Stockholm', pa(220, 0)), post('c', '0180', 'Stockholm', pa(4000, 2000), 'exakt')]);
  assert.equal(med[0].antal, 2);
  assert.deepEqual(med[0].kant, utan[0].kant);
});

test('en organisation utan plats på kartan ger ingen yta', () => {
  assert.deepEqual(kommunytor([post('a', null, null, null, null)]), []);
});

test('etiketten sitter under ytan, mitt för den', () => {
  // Organisationernas namn står ovanför prickarna. Under ytan är det fritt.
  const [yta] = kommunytor([post('a', '0180', 'Stockholm', pa(0, 0)), post('b', '0180', 'Stockholm', pa(600, 0))]);
  const lng = yta.kant.map(([x]) => x);
  assert.equal(yta.fot[1], Math.min(...yta.kant.map(([, lat]) => lat)));
  assert.ok(Math.abs(yta.fot[0] - (Math.min(...lng) + Math.max(...lng)) / 2) < 0.0002, 'mitt emellan ytans västra och östra kant');
});
