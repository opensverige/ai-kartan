// Tester för vyn som visar var OpenSveriges medlemmar finns, som antal per region.
//   npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { visaAntal, summa, cirkel, ikonstorlek, arPaskagg, medlemsvy, MINSTA_ANTAL } from './medlemmar.ts';

const kmMellan = ([lng1, lat1], [lng2, lat2]) => {
  const rad = (g) => (g * Math.PI) / 180;
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
};

test('ett litet antal står som "<5" i underlaget och visas aldrig som siffra', () => {
  assert.equal(MINSTA_ANTAL, 5);
  assert.equal(visaAntal(0), 'ingen än');
  assert.equal(visaAntal('<5'), 'färre än 5');
  assert.equal(visaAntal(5), '5');
  assert.equal(visaAntal(191), '191');
});

test('en siffra mellan 1 och 4 i underlaget stoppar bygget', () => {
  // Repot är publikt. Det lilla antalet får inte stå där heller, så filen ska säga "<5".
  for (const n of [1, 2, 3, 4]) assert.throws(() => visaAntal(n), /<5/);
  assert.throws(() => visaAntal(2.5), /heltal/);
  assert.throws(() => visaAntal(-1), /heltal/);
});

test('summan är exakt när inget antal är dolt', () => {
  assert.equal(summa([191, 77, 45, 10, 0]), '323');
});

test('summan räknar bara det som är känt och säger att den är i underkant', () => {
  // Det dolda antalet finns inte ens i underlaget, så det går inte att räkna fram ur summan.
  assert.equal(summa([191, '<5', 0]), 'drygt 191');
  assert.equal(summa(['<5']), 'färre än 5');
});

test('cirkeln ligger tio mil från mitten åt alla håll och är sluten', () => {
  const mitt = [18.0686, 59.3293];
  const ring = cirkel(mitt[1], mitt[0], 100);
  assert.deepEqual(ring[0], ring.at(-1));
  assert.ok(ring.length >= 48);
  for (const punkt of ring) assert.ok(Math.abs(kmMellan(mitt, punkt) - 100) < 0.5, `punkten låg ${kmMellan(mitt, punkt).toFixed(1)} km bort`);
});

test('cirkeln stämmer också långt norrut, där en grad i öst-väst är kortare', () => {
  const mitt = [20.2597, 63.8258];
  for (const punkt of cirkel(mitt[1], mitt[0], 100)) assert.ok(Math.abs(kmMellan(mitt, punkt) - 100) < 0.5);
});

test('ikonen växer med antalet men försvinner aldrig', () => {
  assert.equal(ikonstorlek(191, 191), 1);
  assert.ok(ikonstorlek(77, 191) < 1 && ikonstorlek(77, 191) > ikonstorlek(10, 191));
  assert.ok(ikonstorlek(0, 191) >= 0.5);
  assert.equal(ikonstorlek(0, 0), 1);
});

test('påskägget hittas av den som söker på föreningen eller kräftan', () => {
  for (const q of ['opensverige', 'OpenSverige', ' open sverige ', 'opensv', 'kräfta', 'Kräftor', 'kräftskiva', 'medlemmar', 'var är vi', 'crayfish']) assert.equal(arPaskagg(q), true, q);
});

test('påskägget stör inte vanliga sökningar', () => {
  for (const q of ['', 'open', 'opena', 'kraft', 'kraftbolag', 'vi', 'vision', 'medlem i', 'stockholm', 'opensverige ab']) assert.equal(arPaskagg(q), false, q);
});

const KOMMUNER = [
  { kod: '0180', lat: 59.3293, lng: 18.0686 },
  { kod: '2480', lat: 63.8258, lng: 20.2597 },
  { kod: '0680', lat: 57.7826, lng: 14.1618 },
];
const data = (regioner, annanOrt = 112) => ({ kalla: 'Discord', uppdaterad: '2026-10-06', radie_km: 100, regioner, annan_ort: annanOrt });

test('vyn som går till webbläsaren har plats, text och storlek per region', () => {
  const vy = medlemsvy(data([{ namn: 'Stockholm', kommun: '0180', antal: 191 }, { namn: 'Umeå', kommun: '2480', antal: 0 }]), KOMMUNER);
  assert.deepEqual(vy.regioner.map((r) => [r.namn, r.visat, r.tom]), [['Stockholm', '191', false], ['Umeå', 'ingen än', true]]);
  assert.deepEqual([vy.regioner[0].lat, vy.regioner[0].lng], [59.3293, 18.0686]);
  assert.equal(vy.regioner[0].storlek, 1);
  // Summan gäller regionerna. De som har valt annan ort har inte sagt var de finns och räknas för sig.
  assert.deepEqual([vy.iRegioner, vy.annanOrt, vy.radieKm, vy.uppdaterad], ['191', '112', 100, '2026-10-06']);
});

test('ett litet antal lämnar aldrig bygget som siffra', () => {
  const vy = medlemsvy(data([{ namn: 'Stockholm', kommun: '0180', antal: 191 }, { namn: 'Jönköping', kommun: '0680', antal: '<5' }, { namn: 'Umeå', kommun: '2480', antal: 0 }], '<5'), KOMMUNER);
  const [, jonkoping, umea] = vy.regioner;
  assert.equal(jonkoping.visat, 'färre än 5');
  assert.equal(jonkoping.tom, false);
  // Storleken får inte heller skilja ett litet antal från ett annat.
  assert.equal(jonkoping.storlek, umea.storlek);
  assert.equal(vy.annanOrt, 'färre än 5');
  assert.equal(vy.iRegioner, 'drygt 191');
  assert.doesNotMatch(JSON.stringify(vy), /"antal"/);
});

test('en region med okänd kommunkod stoppar bygget', () => {
  assert.throws(() => medlemsvy(data([{ namn: 'Ingenstans', kommun: '9999', antal: 10 }]), KOMMUNER), /9999/);
});

test('av två regioner som ligger nära varandra får den västra sitt namn åt sidan', () => {
  const kommuner = [...KOMMUNER, { kod: '1480', lat: 57.7072, lng: 11.9668 }, { kod: '1280', lat: 55.565, lng: 13.0186 }];
  const vy = medlemsvy(
    data([
      { namn: 'Stockholm', kommun: '0180', antal: 191 },
      { namn: 'Göteborg', kommun: '1480', antal: 77 },
      { namn: 'Malmö', kommun: '1280', antal: 45 },
      { namn: 'Jönköping', kommun: '0680', antal: 10 },
      { namn: 'Umeå', kommun: '2480', antal: 0 },
    ]),
    kommuner,
  );
  // Göteborg och Jönköping ligger 13 mil isär på samma breddgrad, och två namn under brickorna
  // krockar. Göteborgs namn ställs väster om brickan. Jönköpings står kvar under: öster om den
  // skulle det krocka med Stockholms på en smal skärm.
  assert.deepEqual(Object.fromEntries(vy.regioner.map((r) => [r.namn, r.sida])), { Stockholm: 'under', Göteborg: 'vanster', Malmö: 'under', Jönköping: 'under', Umeå: 'under' });
});

test('regionfilen i datan går att rita och har bara antal', () => {
  const las = (stig) => JSON.parse(fs.readFileSync(new URL(stig, import.meta.url), 'utf8'));
  const underlag = las('../../data/gemenskap/regioner.json');
  const vy = medlemsvy(underlag, las('../../data/geo/kommuner.json'));
  assert.ok(vy.regioner.length >= 1);
  assert.match(underlag.uppdaterad, /^\d{4}-\d{2}-\d{2}$/);
  // Ett antal är noll, minst fem eller "<5". Siffrorna 1 till 4 får aldrig stå i filen: repot är publikt.
  const tillatet = (antal) => antal === '<5' || antal === 0 || (Number.isInteger(antal) && antal >= 5);
  for (const r of underlag.regioner) {
    assert.deepEqual(Object.keys(r).sort(), ['antal', 'kommun', 'namn']);
    assert.ok(tillatet(r.antal), `${r.namn}: skriv "<5" i stället för ${r.antal}`);
  }
  assert.ok(tillatet(underlag.annan_ort), `annan_ort: skriv "<5" i stället för ${underlag.annan_ort}`);
});
