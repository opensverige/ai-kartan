// Tester för veckopulsen: vad som hänt på kartan de senaste sju dagarna, räknat ur ändringshistoriken.
//   npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import { veckounderlag, veckan, flyttaDag, veckodag, kortDatum, datumspann, dagensDatum, stapelhojd, veckoord } from './vecka.ts';

const ny = (datum, id) => ({ datum, id, namn: id.toUpperCase(), falt: 'hela posten', andring: 'tillagd' });
const bort = (datum, id) => ({ datum, id, namn: id.toUpperCase(), falt: 'hela posten', andring: 'borttagen' });
const falt = (datum, id, andring = 'ändrad') => ({ datum, id, namn: id.toUpperCase(), falt: 'kommun', andring });

// Nyast först, som i history/changelog.json.
const RADER = [ny('2026-10-10', 'd'), falt('2026-10-07', 'a'), falt('2026-10-07', 'b', 'ny status'), ny('2026-10-07', 'c'), ny('2026-10-06', 'b'), ny('2026-10-05', 'a')];
const IDAG = '2026-10-12';
const vecka = (rader = RADER, idag = IDAG) => veckan(veckounderlag(rader, idag), idag);

test('veckan är sju dagar med dagens datum sist', () => {
  const v = vecka();
  assert.equal(v.fran, '2026-10-06');
  assert.equal(v.till, '2026-10-12');
  assert.deepEqual(
    v.dagar.map((d) => d.datum),
    ['2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12'],
  );
});

test('en organisation som lades till för sju dagar sedan räknas inte, en för sex dagar sedan gör det', () => {
  const v = vecka();
  assert.equal(v.nya, 3);
  assert.deepEqual(
    v.dagar.map((d) => d.nya),
    [1, 1, 0, 0, 1, 0, 0],
  );
});

test('ändrade fält räknas som uppdaterade uppgifter, inte som nya organisationer', () => {
  assert.equal(vecka().uppdaterade, 2);
});

test('en borttagen organisation räknas som borttagen', () => {
  const v = vecka([bort('2026-10-11', 'x'), ...RADER, ny('2026-09-01', 'x')]);
  assert.equal(v.borttagna, 1);
});

test('en organisation som lagts till och sedan tagits bort räknas inte som ny', () => {
  const v = vecka([bort('2026-10-11', 'c'), ...RADER]);
  assert.equal(v.nya, 2);
  assert.ok(!v.namn.some((n) => n.id === 'c'), 'ska inte länkas, sidan finns inte kvar');
});

test('en organisation som lagts till igen räknas den dag den senast lades till', () => {
  const v = vecka([ny('2026-10-12', 'a'), bort('2026-10-08', 'a'), ...RADER]);
  assert.deepEqual(
    v.dagar.map((d) => d.nya),
    [1, 1, 0, 0, 1, 0, 1],
  );
});

test('namnen är veckans nya, nyast först', () => {
  assert.deepEqual(
    vecka().namn.map((n) => n.id),
    ['d', 'c', 'b'],
  );
});

test('en vecka utan nya visar ändå vem som lades till senast', () => {
  const v = vecka(RADER, '2026-11-20');
  assert.equal(v.nya, 0);
  assert.deepEqual(v.namn, []);
  assert.deepEqual(v.senast, { datum: '2026-10-10', id: 'd', namn: 'D' });
});

test('utan historik finns ingen senast tillagd', () => {
  const v = vecka([]);
  assert.equal(v.nya, 0);
  assert.equal(v.senast, null);
});

test('samma underlag ger en ny vecka när dagen har bytts, utan att sidan byggs om', () => {
  const underlag = veckounderlag(RADER, IDAG);
  const v = veckan(underlag, '2026-10-14');
  assert.equal(v.fran, '2026-10-08');
  assert.equal(v.nya, 1);
  assert.equal(v.uppdaterade, 0);
  assert.deepEqual(
    v.namn.map((n) => n.id),
    ['d'],
  );
});

test('underlaget bär bara veckans dagar och ett begränsat antal namn, hur många som än lagts till', () => {
  const manga = Array.from({ length: 300 }, (_, i) => ny('2026-10-09', `o${i}`));
  const underlag = veckounderlag([...manga, ...RADER], IDAG, 8);
  assert.equal(underlag.senaste.length, 8);
  assert.ok(underlag.dagar.length <= 7);
  assert.equal(veckan(underlag, IDAG).nya, 303);
});

test('en dag flyttas över månadsskiften och skottdagar', () => {
  assert.equal(flyttaDag('2026-10-03', -6), '2026-09-27');
  assert.equal(flyttaDag('2028-02-28', 1), '2028-02-29');
  assert.equal(flyttaDag('2026-12-31', 1), '2027-01-01');
});

test('veckodagen skrivs kort på svenska', () => {
  assert.equal(veckodag('2026-10-12'), 'mån');
  assert.equal(veckodag('2026-10-10'), 'lör');
});

test('ett kort datum har dag och månad men inget år', () => {
  assert.equal(kortDatum('2026-10-10'), '10 okt');
});

test('ett spann inom en månad skriver månaden en gång, över ett skifte två', () => {
  assert.equal(datumspann('2026-10-06', '2026-10-12'), '6–12 okt');
  assert.equal(datumspann('2026-09-28', '2026-10-04'), '28 sep–4 okt');
});

test('dagens datum är dagen i Sverige, inte i besökarens tidszon', () => {
  assert.equal(dagensDatum(new Date('2026-10-11T21:59:00Z')), '2026-10-11');
  assert.equal(dagensDatum(new Date('2026-10-11T22:01:00Z')), '2026-10-12');
});

test('den högsta stapeln fyller höjden och en tom dag har ingen stapel', () => {
  assert.equal(stapelhojd(9, 9), 100);
  assert.equal(stapelhojd(0, 9), 0);
});

test('en dag med en enda ny syns även bredvid en dag med hundratals', () => {
  assert.equal(stapelhojd(1, 300), 12);
});

test('en vecka utan nya ger inga staplar i stället för en delning med noll', () => {
  assert.equal(stapelhojd(0, 0), 0);
});

test('orden böjs efter talet: en ny organisation, flera nya organisationer', () => {
  assert.deepEqual(veckoord({ nya: 1, uppdaterade: 1, borttagna: 1 }), { kort: 'ny', nya: 'ny organisation', uppdaterade: 'uppdaterad uppgift', borttagna: 'borttagen' });
  assert.deepEqual(veckoord({ nya: 19, uppdaterade: 25, borttagna: 0 }), { kort: 'nya', nya: 'nya organisationer', uppdaterade: 'uppdaterade uppgifter', borttagna: 'borttagna' });
});
