// Tester för var organisationer ritas inom en kommun: i ett rutnät runt mittpunkten, på land.
//   npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import { platsnat, packa, packaUpp, landplatser, fordela, platserPaLand, STEG, RADIE } from './lib/landplatser.mjs';
import path from 'node:path';
import { harled, lasGeo, lasJson, lasOrganisationer, KATALOG_GEO } from './lib/organisationer.mjs';

test('rutnätet börjar i mittpunkten och går utåt', () => {
  const nat = platsnat();
  assert.deepEqual(nat[0], [0, 0]);
  const avstand = nat.map(([x, y]) => Math.hypot(x, y));
  // Koordinaterna är avrundade till decimeter, så rutor i samma ring kan skilja någon centimeter.
  for (let i = 1; i < avstand.length; i++) assert.ok(avstand[i] >= avstand[i - 1] - 0.5, `ruta ${i} ligger närmare än rutan före`);
  assert.ok(avstand.at(-1) <= RADIE + 0.5);
});

test('ingen ruta ligger närmare en annan än stegets längd', () => {
  const nat = platsnat().slice(0, 60);
  for (let i = 0; i < nat.length; i++)
    for (let j = i + 1; j < nat.length; j++) assert.ok(Math.hypot(nat[i][0] - nat[j][0], nat[i][1] - nat[j][1]) >= STEG - 0.5);
});

test('rutnätet är detsamma varje gång', () => {
  assert.deepEqual(platsnat(), platsnat());
  assert.ok(platsnat().length > 400);
});

test('en mask går att packa och packa upp utan att ändras', () => {
  const bitar = platsnat().map((_, i) => i % 3 !== 0);
  assert.deepEqual(packaUpp(packa(bitar), bitar.length), bitar);
  assert.match(packa(bitar), /^[0-9a-f]+$/);
});

test('landplatserna hoppar över rutor i vatten och ligger runt kommunens mittpunkt', () => {
  const nat = platsnat();
  // Mittrutan och den närmaste ringen ligger i vatten.
  const mask = packa(nat.map(([x, y]) => Math.hypot(x, y) > STEG * 1.2));
  const platser = landplatser({ lat: 57.78, lng: 14.16 }, mask);
  assert.equal(platser.length, nat.length - 7);
  const [lat, lng] = platser[0];
  const meter = Math.hypot((lat - 57.78) * 111320, (lng - 14.16) * 111320 * Math.cos((57.78 * Math.PI) / 180));
  assert.ok(meter > STEG * 1.2 && meter < STEG * 2.1, `första landrutan låg ${Math.round(meter)} m från mitten`);
});

test('organisationerna i en kommun får var sin plats, närmast mitten först', () => {
  const platser = landplatser({ lat: 59.33, lng: 18.07 }, packa(platsnat().map(() => true)));
  const tilldelning = fordela(['c-bolag', 'a-bolag', 'b-bolag'], platser);
  const valda = [...tilldelning.values()].map((p) => p.join());
  assert.equal(new Set(valda).size, 3);
  assert.deepEqual(new Set(valda), new Set(platser.slice(0, 3).map((p) => p.join())));
});

test('fördelningen beror inte på i vilken ordning organisationerna kommer', () => {
  const platser = landplatser({ lat: 59.33, lng: 18.07 }, packa(platsnat().map(() => true)));
  const a = fordela(['x', 'y', 'z', 'w'], platser);
  const b = fordela(['w', 'z', 'y', 'x'], platser);
  assert.deepEqual([...a].sort(), [...b].sort());
});

test('finns det fler organisationer än landplatser får de sista ingen plats', () => {
  const tilldelning = fordela(['a', 'b', 'c'], [[59.33, 18.07], [59.34, 18.07]]);
  assert.equal(tilldelning.size, 2);
});

const meterMellan = ([lat1, lng1], [lat2, lng2]) => Math.hypot((lat1 - lat2) * 111320, (lng1 - lng2) * 111320 * Math.cos((lat1 * Math.PI) / 180));
const minstaAvstand = (platser) => {
  let minst = Infinity;
  for (let i = 0; i < platser.length; i++) for (let j = i + 1; j < platser.length; j++) minst = Math.min(minst, meterMellan(platser[i], platser[j]));
  return minst;
};
const JONKOPING = { kod: '0680', lat: 57.78, lng: 14.16 };
const ALLT_LAND = packa(platsnat().map(() => true));

test('en kommun med få organisationer får glesare platser, så att namnen ryms', () => {
  const fyra = landplatser(JONKOPING, ALLT_LAND, 4).slice(0, 4);
  assert.ok(minstaAvstand(fyra) > STEG * 2.9, `fyra organisationer låg ${Math.round(minstaAvstand(fyra))} m isär`);
  const trettio = landplatser(JONKOPING, ALLT_LAND, 30).slice(0, 30);
  assert.ok(minstaAvstand(trettio) > STEG * 1.9 && minstaAvstand(trettio) < STEG * 2.1);
  const manga = landplatser(JONKOPING, ALLT_LAND, 120).slice(0, 120);
  assert.ok(minstaAvstand(manga) < STEG * 1.1);
});

test('glesa platser håller sig nära mitten och räcker alltid till alla', () => {
  for (const antal of [1, 4, 19, 20, 37, 38, 200]) {
    const platser = landplatser(JONKOPING, ALLT_LAND, antal);
    assert.ok(platser.length >= antal, `${antal} organisationer fick ${platser.length} platser`);
    if (antal <= 37) assert.ok(meterMellan(platser[antal - 1], [JONKOPING.lat, JONKOPING.lng]) <= 1500);
  }
});

test('glesa platser hoppar också över vatten', () => {
  // Allt öster om mittpunkten är vatten.
  const mask = packa(platsnat().map(([x]) => x < -1));
  for (const antal of [3, 25, 150]) {
    for (const [, lng] of landplatser(JONKOPING, mask, antal)) assert.ok(lng < JONKOPING.lng);
  }
});

const geo = { kommunPerKod: new Map([[JONKOPING.kod, JONKOPING]]), lanPerKod: new Map(), land: { [JONKOPING.kod]: ALLT_LAND } };
const post = (id, kommun, extra = {}) => ({ id, kommun: { value: kommun }, ...extra });

test('varje organisation utan egna koordinater får en egen plats i sin kommun', () => {
  const platser = platserPaLand([post('a', '0680'), post('b', '0680'), post('c', '0680')], geo);
  assert.equal(platser.size, 3);
  assert.equal(new Set([...platser.values()].map((p) => `${p.lat},${p.lng}`)).size, 3);
  for (const p of platser.values()) assert.ok(meterMellan([p.lat, p.lng], [JONKOPING.lat, JONKOPING.lng]) <= 1500);
});

test('egna koordinater, okänd kommun och kommun utan landmask lämnas åt sidan', () => {
  const platser = platserPaLand(
    [post('egen', '0680', { coordinates: { value: { lat: 57.7, lng: 14.1 } } }), post('utan-kommun', null), post('utan-mask', '0180'), post('vanlig', '0680')],
    geo,
  );
  assert.deepEqual([...platser.keys()], ['vanlig']);
});

test('härledningen använder platsen på land när den finns', () => {
  const platser = new Map([['a', { lat: 57.79, lng: 14.15 }]]);
  assert.deepEqual(harled(post('a', '0680'), geo, platser).position, { lat: 57.79, lng: 14.15 });
  assert.equal(harled(post('a', '0680'), geo, platser).position_typ, 'kommun');
  // Utan plats på land gäller den gamla förskjutningen, så att ingen organisation tappar sin punkt.
  assert.ok(harled(post('b', '0680'), geo, platser).position);
  const exakt = harled(post('a', '0680', { coordinates: { value: { lat: 57.7, lng: 14.1 } } }), geo, platser);
  assert.deepEqual(exakt.position, { lat: 57.7, lng: 14.1 });
  assert.equal(exakt.position_typ, 'exakt');
});

test('i den riktiga datan får varje organisation med kommun en egen plats på land', () => {
  const riktigGeo = lasGeo();
  const poster = lasOrganisationer().map((p) => p.data).filter(Boolean);
  const platser = platserPaLand(poster, riktigGeo);
  const vantade = poster.filter((d) => d.kommun?.value && !d.coordinates?.value);
  assert.ok(vantade.length > 100);
  assert.deepEqual(vantade.filter((d) => !platser.has(d.id)).map((d) => d.id), []);
  assert.equal(new Set([...platser.values()].map((p) => `${p.lat},${p.lng}`)).size, platser.size);
});

test('land.json är byggd för det rutnät som koden använder, med en mask per kommun', () => {
  const land = lasJson(path.join(KATALOG_GEO, 'land.json'));
  const rutor = platsnat().length;
  assert.deepEqual([land.steg, land.radie, land.rutor], [STEG, RADIE, rutor]);
  const kommuner = lasJson(path.join(KATALOG_GEO, 'kommuner.json'));
  // Koder utan inledande nolla läses som tal och hamnar först i objektet, därav sorteringen.
  assert.deepEqual(Object.keys(land.kommuner).sort(), kommuner.map((k) => k.kod).sort());
  for (const [kod, mask] of Object.entries(land.kommuner)) {
    assert.match(mask, /^[0-9a-f]+$/, `kommun ${kod}`);
    assert.equal(mask.length, Math.ceil(rutor / 4), `kommun ${kod}`);
    assert.ok(packaUpp(mask, rutor).filter(Boolean).length >= 120, `kommun ${kod} har för lite land för att rymma sina organisationer`);
  }
});
