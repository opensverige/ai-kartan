// Tester för det som rör sig i pixelstäderna: nätens uppgift om vad som syns.
//   npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import { jamnaSynlighet } from './liv.ts';

/** En kant, eller flera med `granser`, skriven som ettor (syns) och nollor (dold). */
function jamna(bitar, granser) {
  const syns = Uint8Array.from(bitar.replace(/\s/g, ''), Number);
  jamnaSynlighet(Uint32Array.from(granser ?? [0, syns.length]), syns, 4, 2);
  return Array.from(syns).join('');
}

test('en kort lucka mellan synliga punkter fylls', () => {
  assert.equal(jamna('111 0 111'), '1111111');
  assert.equal(jamna('111 0000 111'), '1111111111');
});

test('en lång dold sträcka är ett hus eller en bro, och står kvar', () => {
  assert.equal(jamna('111 00000 111'), '11100000111');
  assert.equal(jamna('1111 000000000000 1111'), '11110000000000001111');
});

test('en synlig ö mitt i det dolda tas bort', () => {
  assert.equal(jamna('00000 1 00000'), '00000000000');
  assert.equal(jamna('00000 11 00000'), '000000000000');
  assert.equal(jamna('00000 111 00000'), '0000011100000');
});

test('prickigt underlag blir en sträcka som syns', () => {
  // Så såg underlaget ut: de flesta dolda sträckor var en enda punkt långa.
  assert.equal(jamna('1101 1011 0111 0110 1101'), '11111111111111111111');
});

test('en kort dold bit vid kantens ände fylls, en lång står kvar', () => {
  assert.equal(jamna('00 111111'), '11111111');
  assert.equal(jamna('111111 00'), '11111111');
  assert.equal(jamna('000 111111'), '000111111');
  // i en kant på fyra punkter eller färre rörs inget vid ändarna
  assert.equal(jamna('0011'), '0011');
});

test('en kant som är helt dold eller helt synlig rörs inte', () => {
  assert.equal(jamna('000000'), '000000');
  assert.equal(jamna('111111'), '111111');
});

test('varje kant jämnas för sig: en lucka räknas inte över en korsning', () => {
  // två kanter på sex punkter: luckan på fem punkter ligger över gränsen mellan dem
  assert.equal(jamna('111000 001111', [0, 6, 12]), '111000111111');
});
