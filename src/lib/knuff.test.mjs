// Tester för knuffen på kartan: vilken grupp ringen hamnar på och var orden får stå.
//   npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import { MINST_I_GRUPPEN, AVSTAND, knuffordning, etikettrutor, korsar, ryms } from './knuff.ts';

const grupper = [
  { kod: '01', antal: 140 },
  { kod: '14', antal: 54 },
  { kod: '12', antal: 34 },
  { kod: '24', antal: 15 },
  { kod: '23', antal: 3 },
  { kod: '20', antal: 2 },
];

/** Ger talen i tur och ordning, och börjar om när de tar slut. */
function slumpfoljd(...tal) {
  let i = 0;
  return () => tal[i++ % tal.length];
}

test('ringen hamnar inte alltid på det största länet', () => {
  // Alltid samma län vore att peka ut det. Varje grupp som är stor nog ska kunna komma först.
  const forst = new Set();
  for (let i = 0; i < 40; i++) forst.add(knuffordning(grupper, slumpfoljd(i / 40, (i * 7) % 40 / 40, (i * 13) % 40 / 40))[0].kod);
  assert.deepEqual([...forst].sort(), ['01', '12', '14', '24']);
});

test('en grupp som är för liten att träffa med tummen får aldrig ringen', () => {
  const ordning = knuffordning(grupper, slumpfoljd(0.3, 0.9, 0.1));
  assert.equal(ordning.length, 4);
  assert.ok(ordning.every((g) => g.antal >= MINST_I_GRUPPEN));
});

test('finns bara små grupper får en av dem ringen', () => {
  const sma = [{ kod: '23', antal: 3 }, { kod: '20', antal: 2 }];
  assert.deepEqual(knuffordning(sma, slumpfoljd(0)).map((g) => g.kod).sort(), ['20', '23']);
  assert.deepEqual(knuffordning([], slumpfoljd(0)), []);
});

test('ordningen är en blandning: alla är med en gång, och listan som kom in är orörd', () => {
  const fore = grupper.map((g) => g.kod);
  const ordning = knuffordning(grupper, slumpfoljd(0.99, 0.5, 0.01));
  assert.deepEqual(ordning.map((g) => g.kod).sort(), ['01', '12', '14', '24']);
  assert.deepEqual(grupper.map((g) => g.kod), fore);
});

test('samma slumptal ger samma ordning', () => {
  const a = knuffordning(grupper, slumpfoljd(0.2, 0.7, 0.4)).map((g) => g.kod);
  const b = knuffordning(grupper, slumpfoljd(0.2, 0.7, 0.4)).map((g) => g.kod);
  assert.deepEqual(a, b);
});

test('orden prövas på fyra platser snett utanför ringen, nedåt till höger först', () => {
  const d = 40 * AVSTAND;
  const rutor = etikettrutor(200, 300, 40, 120, 28);
  assert.deepEqual(rutor.map(([lage]) => lage), ['nh', 'uh', 'nv', 'uv']);
  assert.deepEqual(rutor[0][1], { v: 200 + d, t: 300 + d, h: 200 + d + 120, b: 300 + d + 28 });
  assert.deepEqual(rutor[1][1], { v: 200 + d, t: 300 - d - 28, h: 200 + d + 120, b: 300 - d });
  assert.deepEqual(rutor[2][1], { v: 200 - d - 120, t: 300 + d, h: 200 - d, b: 300 + d + 28 });
  assert.deepEqual(rutor[3][1], { v: 200 - d - 120, t: 300 - d - 28, h: 200 - d, b: 300 - d });
});

test('ingen av de fyra platserna når in i ringen', () => {
  // Hörnet närmast gruppen ligger utanför ringens radie, så att orden aldrig täcker siffran.
  for (const [, r] of etikettrutor(0, 0, 40, 120, 28)) {
    const x = Math.min(Math.abs(r.v), Math.abs(r.h));
    const y = Math.min(Math.abs(r.t), Math.abs(r.b));
    assert.ok(Math.hypot(x, y) >= 40, `hörnet ligger ${Math.hypot(x, y)} från mitten`);
  }
});

test('två rutor korsar varandra bara om de delar yta', () => {
  const a = { v: 0, t: 0, h: 10, b: 10 };
  assert.equal(korsar(a, { v: 5, t: 5, h: 15, b: 15 }), true);
  assert.equal(korsar(a, { v: 10, t: 0, h: 20, b: 10 }), false);
  assert.equal(korsar(a, { v: 0, t: 11, h: 10, b: 20 }), false);
  assert.equal(korsar(a, { v: 2, t: 2, h: 4, b: 4 }), true);
});

test('en ruta ryms bara om hela ligger inom ytan', () => {
  const yta = { v: 8, t: 8, h: 367, b: 500 };
  assert.equal(ryms({ v: 8, t: 8, h: 100, b: 40 }, yta), true);
  assert.equal(ryms({ v: 300, t: 100, h: 368, b: 128 }, yta), false);
  assert.equal(ryms({ v: 100, t: 490, h: 200, b: 518 }, yta), false);
  assert.equal(ryms({ v: 0, t: 100, h: 90, b: 128 }, yta), false);
});
