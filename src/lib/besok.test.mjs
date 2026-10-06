// Tester för besöksräkningen: vad som får lämna webbläsaren och vem som inte räknas.
//   npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import { raknadAdress, vagrarRakning } from './besok.ts';

test('adressen räknas utan frågedel, så att söktext och filter stannar i webbläsaren', () => {
  assert.equal(raknadAdress('https://karta.opensverige.se/?q=hemlig+s%C3%B6kning&lan=01'), 'https://karta.opensverige.se/');
  assert.equal(raknadAdress('https://karta.opensverige.se/organisationer?typ=bolag'), 'https://karta.opensverige.se/organisationer');
  assert.equal(raknadAdress('https://karta.opensverige.se/organisation/ai-sweden'), 'https://karta.opensverige.se/organisation/ai-sweden');
});

test('ankaret följer inte heller med', () => {
  assert.equal(raknadAdress('https://karta.opensverige.se/metod#plats'), 'https://karta.opensverige.se/metod');
  assert.equal(raknadAdress('https://karta.opensverige.se/#x?q=y'), 'https://karta.opensverige.se/');
});

test('den som har bett att inte bli spårad räknas inte', () => {
  assert.equal(vagrarRakning({ doNotTrack: '1' }), true);
  assert.equal(vagrarRakning({ doNotTrack: 'yes' }), true);
  assert.equal(vagrarRakning({ globalPrivacyControl: true }), true);
  assert.equal(vagrarRakning({ doNotTrack: '0', globalPrivacyControl: false }), false);
  assert.equal(vagrarRakning({ doNotTrack: null }), false);
  assert.equal(vagrarRakning({}), false);
});
