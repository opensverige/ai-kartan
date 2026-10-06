// Tester för läsningen av vektorbrickor: bara det som behövs för att avgöra om en punkt ligger i vatten.
//   npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import { lasLager, iYta, brickpunkt } from './lib/mvt.mjs';

// En minimal kodare, så att testet kan bygga en bricka utan nätverk och utan andra paket.
const varint = (n) => { const b = []; while (n > 127) { b.push((n & 127) | 128); n = Math.floor(n / 128); } b.push(n); return b; };
const zigzag = (n) => (n < 0 ? -n * 2 - 1 : n * 2);
const falt = (nr, bytes) => [...varint((nr << 3) | 2), ...varint(bytes.length), ...bytes];
const tal = (nr, n) => [...varint(nr << 3), ...varint(n)];
/** En ring som MVT-geometri: MoveTo, LineTo för resten, ClosePath. Koordinater i brickans enheter. */
function ring(punkter, fran = [0, 0]) {
  const ut = [...varint((1 << 3) | 1), ...varint(zigzag(punkter[0][0] - fran[0])), ...varint(zigzag(punkter[0][1] - fran[1]))];
  ut.push(...varint(((punkter.length - 1) << 3) | 2));
  for (let i = 1; i < punkter.length; i++) ut.push(...varint(zigzag(punkter[i][0] - punkter[i - 1][0])), ...varint(zigzag(punkter[i][1] - punkter[i - 1][1])));
  ut.push(...varint((1 << 3) | 7));
  return { bytes: ut, sist: punkter.at(-1) };
}
function yta(ringar) {
  let fran = [0, 0];
  const geometri = [];
  for (const r of ringar) { const k = ring(r, fran); geometri.push(...k.bytes); fran = k.sist; }
  return falt(2, [...tal(3, 3), ...falt(4, geometri)]);
}
const lager = (namn, ytor) => falt(3, [...falt(1, [...Buffer.from(namn)]), ...ytor.flat(), ...tal(5, 4096)]);

const SJO = [[1000, 1000], [3000, 1000], [3000, 3000], [1000, 3000]];
const O = [[1800, 1800], [1800, 2200], [2200, 2200], [2200, 1800]];
const bricka = Uint8Array.from([...lager('landcover', [yta([[[0, 0], [4096, 0], [4096, 4096], [0, 4096]]])]), ...lager('water', [yta([SJO, O])])]);

test('lagret hittas på namn och ger ytornas ringar', () => {
  const vatten = lasLager(bricka, 'water');
  assert.equal(vatten.extent, 4096);
  assert.equal(vatten.ytor.length, 1);
  assert.deepEqual(vatten.ytor[0][0], SJO);
  assert.deepEqual(vatten.ytor[0][1], O);
});

test('ett lager som saknas ger inga ytor', () => {
  assert.deepEqual(lasLager(bricka, 'finns-inte').ytor, []);
});

test('en punkt i sjön ligger i vatten, en punkt på stranden gör det inte', () => {
  const { ytor } = lasLager(bricka, 'water');
  assert.equal(iYta(ytor, 1500, 1500), true);
  assert.equal(iYta(ytor, 500, 500), false);
});

test('en ö i sjön räknas som land', () => {
  const { ytor } = lasLager(bricka, 'water');
  assert.equal(iYta(ytor, 2000, 2000), false);
});

test('en koordinat räknas om till bricka och punkt i brickan', () => {
  const p = brickpunkt(0, 0, 1, 4096);
  assert.deepEqual([p.x, p.y, p.px, p.py], [1, 1, 0, 0]);
  const q = brickpunkt(59.33, 18.07, 12, 4096);
  assert.equal(q.x, 2253);
  assert.equal(q.y, 1204);
  assert.ok(q.px >= 0 && q.px < 4096 && q.py >= 0 && q.py < 4096);
});
