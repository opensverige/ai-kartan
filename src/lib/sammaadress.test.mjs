// Tester för organisationer som delar adress: var och en ska få sin egen prick runt adressen.
//   npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import { adressplatser, adressetikett, delaAdresser, STEG, STEG_IKON } from './sammaadress.ts';

const HUS = { lat: 59.3326, lng: 18.0649 };
const post = (id, n, extra = {}) => ({ id, n, t: 'bolag', pt: 'exakt', ...HUS, ...extra });
const avstand = ([ax, ay], [bx, by]) => Math.hypot(ax - bx, ay - by);
const mitt = (platser) => [0, 1].map((i) => platser.reduce((s, p) => s + p[i], 0) / platser.length);

test('en ensam prick står på adressen', () => {
  assert.deepEqual(adressplatser(1), [[0, 0]]);
});

test('två prickar står bredvid varandra, lika långt från adressen', () => {
  assert.deepEqual(adressplatser(2), [[-STEG / 2, 0], [STEG / 2, 0]]);
});

test('tre prickar står med en överst och två under', () => {
  const [overst, vanster, hoger] = adressplatser(3);
  assert.equal(overst[0], 0);
  assert.ok(overst[1] < vanster[1]);
  assert.equal(vanster[1], hoger[1]);
  assert.equal(vanster[0], -hoger[0]);
});

test('fyra prickar står två och två', () => {
  const h = STEG / 2;
  assert.deepEqual(adressplatser(4), [[-h, -h], [h, -h], [-h, h], [h, h]]);
});

test('ingen prick ligger närmare en annan än steget, hur många de än är', () => {
  for (let antal = 2; antal <= 24; antal++) {
    const platser = adressplatser(antal);
    assert.equal(platser.length, antal);
    for (let i = 0; i < antal; i++) {
      for (let j = i + 1; j < antal; j++) {
        const d = avstand(platser[i], platser[j]);
        assert.ok(d >= STEG - 0.05, `${antal} prickar: plats ${i} och ${j} ligger ${d.toFixed(2)} isär`);
      }
    }
  }
});

test('gruppen har adressen i mitten', () => {
  for (const antal of [2, 3, 4, 5, 6, 7, 19]) {
    const [x, y] = mitt(adressplatser(antal));
    assert.ok(Math.abs(x) < 0.05 && Math.abs(y) < 0.05, `${antal} prickar har mitten i ${x.toFixed(2)}, ${y.toFixed(2)}`);
  }
});

test('platserna står i läsordning', () => {
  for (const antal of [3, 5, 7, 12]) {
    const platser = adressplatser(antal);
    for (let i = 1; i < antal; i++) {
      const [fx, fy] = platser[i - 1];
      const [x, y] = platser[i];
      assert.ok(y > fy || (y === fy && x > fx), `${antal} prickar: plats ${i} står före plats ${i - 1}`);
    }
  }
});

test('sju prickar står med en i mitten och sex runt om', () => {
  const platser = adressplatser(7);
  assert.ok(platser.some(([x, y]) => x === 0 && y === 0));
  assert.equal(platser.filter((p) => Math.abs(avstand(p, [0, 0]) - STEG) < 0.05).length, 6);
});

test('två på samma adress skrivs med namn, fler med antal', () => {
  assert.equal(adressetikett(['Lovable', 'Netlight']), 'Lovable · Netlight');
  assert.equal(adressetikett(['A', 'B', 'C']), '3 på samma adress');
});

test('två på samma adress får var sin plats, i bokstavsordning från vänster', () => {
  const platser = delaAdresser([post('netlight', 'Netlight'), post('lovable', 'Lovable')]);
  assert.deepEqual(platser.get('lovable'), { antal: 2, dx: -STEG / 2, dy: 0, etikett: 'Lovable · Netlight', topp: 0, botten: 0 });
  assert.deepEqual(platser.get('netlight'), { antal: 2, dx: STEG / 2, dy: 0, etikett: '', topp: 0, botten: 0 });
});

test('den som är ensam på sin adress står kvar och bär sitt namn', () => {
  const platser = delaAdresser([post('a', 'A'), post('b', 'B', { lat: 57.7 })]);
  assert.deepEqual(platser.get('a'), { antal: 1, dx: 0, dy: 0, etikett: 'A', topp: 0, botten: 0 });
  assert.deepEqual(platser.get('b'), { antal: 1, dx: 0, dy: 0, etikett: 'B', topp: 0, botten: 0 });
});

test('organisationer på kommunnivå delas inte upp, fast de har samma punkt', () => {
  const platser = delaAdresser([post('a', 'A', { pt: 'kommun' }), post('b', 'B', { pt: 'kommun' })]);
  assert.equal(platser.get('a').antal, 1);
  assert.equal(platser.get('b').dx, 0);
});

test('gruppen följer urvalet: den som blir ensam kvar står på adressen', () => {
  const alla = [post('lovable', 'Lovable'), post('netlight', 'Netlight')];
  assert.equal(delaAdresser(alla).get('netlight').dx, STEG / 2);
  assert.equal(delaAdresser(alla.slice(1)).get('netlight').dx, 0);
});

test('en grupp med en ikon i får mer luft, så att ikonen inte täcker grannen', () => {
  const poster = [post('a', 'A'), post('m', 'Myndigheten', { t: 'myndighet' })];
  const platser = delaAdresser(poster, (typ) => typ === 'myndighet');
  assert.equal(platser.get('a').dx, -STEG_IKON / 2);
  assert.equal(platser.get('m').dx, STEG_IKON / 2);
});

test('toppen och botten följer gruppens högsta och lägsta prick', () => {
  const platser = delaAdresser([post('a', 'A'), post('b', 'B'), post('c', 'C')]);
  const tre = adressplatser(3);
  assert.equal(platser.get('a').topp, tre[0][1]);
  assert.equal(platser.get('c').botten, tre[2][1]);
  assert.equal(platser.get('a').etikett, '3 på samma adress');
});
