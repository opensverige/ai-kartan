// Tester för palettens läge: vad den visar för texten i fältet, och vilka svar som får ritas
// när frågor, svar och skrivande korsar varandra.
//   npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import { skapaPalettlage } from './palettlage.ts';
import { MAX_TECKEN } from './typer.ts';

/** Ställer en fråga som ska vänta på svar, och ger den väntande frågan. */
function stall(lage, text) {
  const start = lage.fraga(text);
  assert.equal(start.sort, 'vantar');
  assert.equal(lage.tillstand(), 'vantar');
  return start.stalld;
}

test('tom text visar den tomma paletten och text visar förslag', () => {
  const lage = skapaPalettlage();
  assert.deepEqual(lage.visa(''), { sort: 'tom' });
  assert.equal(lage.tillstand(), 'tom');
  assert.deepEqual(lage.visa('  röst '), { sort: 'forslag', q: 'röst' });
  assert.equal(lage.tillstand(), 'forslag');
  assert.equal(lage.senaste(), null);
});

test('ett svar som kommer i tid sparas och visas för samma fråga utan nytt anrop', () => {
  const lage = skapaPalettlage();
  const f = stall(lage, ' röst ');
  assert.equal(f.q, 'röst');
  assert.equal(lage.aktuell(f), true);
  assert.equal(lage.svarat(f, 'A'), true);
  assert.equal(lage.tillstand(), 'svar');
  assert.equal(lage.senaste(), 'A');
  assert.deepEqual(lage.fraga('röst'), { sort: 'svar', sparat: 'A' });
  lage.visa('rös');
  assert.deepEqual(lage.visa('röst'), { sort: 'svar', sparat: 'A' });
});

test('paletten öppnas igen medan svaret väntar, och svaret får komma', () => {
  const lage = skapaPalettlage();
  const f = stall(lage, 'röst');
  // Att öppna paletten läser fältet igen. Samma text lämnar innehållet som det är.
  assert.deepEqual(lage.visa('röst'), { sort: 'kvar' });
  assert.deepEqual(lage.visa(' röst '), { sort: 'kvar' });
  assert.equal(lage.tillstand(), 'vantar');
  assert.equal(lage.aktuell(f), true);
  assert.equal(lage.svarat(f, 'A'), true);
  assert.equal(lage.senaste(), 'A');
});

test('en annan text i fältet slänger svaret som väntar', () => {
  const lage = skapaPalettlage();
  const f = stall(lage, 'röst');
  assert.deepEqual(lage.visa('röstagent'), { sort: 'forslag', q: 'röstagent' });
  assert.equal(lage.aktuell(f), false);
  assert.equal(lage.svarat(f, 'A'), false);
  assert.equal(lage.misslyckad(f), false);
  assert.equal(lage.senaste(), null);
  assert.equal(lage.tillstand(), 'forslag');
});

test('tillbaka till en fråga med sparat svar visar aldrig ett gammalt svar som väntar', () => {
  const lage = skapaPalettlage();
  const a = stall(lage, 'röst');
  lage.svarat(a, 'A');
  const b = stall(lage, 'hälsa');
  // Besökaren skriver tillbaka den första frågan innan svaret på den andra har kommit.
  assert.deepEqual(lage.visa('röst'), { sort: 'svar', sparat: 'A' });
  assert.equal(lage.aktuell(b), false);
  assert.equal(lage.svarat(b, 'B'), false);
  assert.equal(lage.misslyckad(b), false);
  assert.equal(lage.senaste(), 'A');
  assert.equal(lage.tillstand(), 'svar');
  // Samma sak när den sparade frågan ställs igen i stället för att skrivas.
  const c = stall(lage, 'skog');
  assert.deepEqual(lage.fraga('röst'), { sort: 'svar', sparat: 'A' });
  assert.equal(lage.svarat(c, 'C'), false);
  assert.equal(lage.senaste(), 'A');
});

test('två snabba frågor ritar bara den sista', () => {
  const lage = skapaPalettlage();
  const a = stall(lage, 'röst');
  const b = stall(lage, 'hälsa');
  // Svaren kommer i fel ordning: den sista först.
  assert.equal(lage.aktuell(b), true);
  assert.equal(lage.svarat(b, 'B'), true);
  assert.equal(lage.aktuell(a), false);
  assert.equal(lage.svarat(a, 'A'), false);
  assert.equal(lage.senaste(), 'B');
  // Och i rätt ordning: den första blir inaktuell redan när den andra ställs.
  const c = stall(lage, 'skog');
  const d = stall(lage, 'gpu');
  assert.equal(lage.svarat(c, 'C'), false);
  assert.equal(lage.misslyckad(c), false);
  assert.equal(lage.svarat(d, 'D'), true);
  assert.equal(lage.senaste(), 'D');
});

test('en tom eller för lång fråga ändrar ingenting, och svaret som väntar gäller', () => {
  const lage = skapaPalettlage();
  const f = stall(lage, 'röst');
  assert.deepEqual(lage.fraga('   '), { sort: 'ingen' });
  assert.deepEqual(lage.fraga('a'.repeat(MAX_TECKEN + 1)), { sort: 'ingen' });
  assert.equal(lage.tillstand(), 'vantar');
  assert.equal(lage.aktuell(f), true);
  assert.equal(lage.fraga('a'.repeat(MAX_TECKEN)).sort, 'vantar');
});

test('en fråga utan svar visar raden om det bara när den gäller', () => {
  const lage = skapaPalettlage();
  const f = stall(lage, 'röst');
  assert.equal(lage.misslyckad(f), true);
  assert.equal(lage.tillstand(), 'svar');
  // Felet sparas inte som svar. Samma fråga ställs på nytt.
  assert.equal(lage.senaste(), null);
  assert.equal(lage.fraga('röst').sort, 'vantar');
});

test('att skriva bort och tillbaka till frågan som väntar tar inte tillbaka svaret', () => {
  // Så har paletten alltid gjort: att skriva bort byter innehållet, och svaret ritas inte.
  const lage = skapaPalettlage();
  const f = stall(lage, 'röst');
  lage.visa('rös');
  assert.deepEqual(lage.visa('röst'), { sort: 'forslag', q: 'röst' });
  assert.equal(lage.aktuell(f), false);
});

test('loggan glömmer det sparade svaret men slänger inte svaret som väntar', () => {
  // Så har paletten alltid gjort: loggan nollställer bara det sparade svaret.
  const lage = skapaPalettlage();
  const a = stall(lage, 'röst');
  lage.svarat(a, 'A');
  const b = stall(lage, 'hälsa');
  lage.glom();
  assert.equal(lage.senaste(), null);
  assert.equal(lage.aktuell(b), true);
  assert.deepEqual(lage.visa('röst'), { sort: 'forslag', q: 'röst' });
});
