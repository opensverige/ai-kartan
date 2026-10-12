// Tester för händelserna på kartsidan: vad som räknas, hur ofta, och vad som aldrig får följa med.
//   npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import { HANDELSER, tidsklass, tillaten, skapaHandelser, tillVercel } from './handelser.ts';

/** Samlar det som skulle ha skickats. */
function fangare() {
  const skickat = [];
  return { skickat, skicka: (namn, data) => skickat.push([namn, data]) };
}

test('tiden till ritad karta sägs i fyra steg, aldrig som ett exakt tal', () => {
  assert.equal(tidsklass(0), 'under 2 s');
  assert.equal(tidsklass(1999), 'under 2 s');
  assert.equal(tidsklass(2000), '2 till 4 s');
  assert.equal(tidsklass(3999), '2 till 4 s');
  assert.equal(tidsklass(4000), '4 till 8 s');
  assert.equal(tidsklass(7999), '4 till 8 s');
  assert.equal(tidsklass(8000), 'över 8 s');
  assert.equal(tidsklass(120000), 'över 8 s');
});

test('första handlingen räknas en gång per sidladdning, med sitt slag', () => {
  const { skickat, skicka } = fangare();
  const h = skapaHandelser(skicka);
  assert.equal(h.harHandlat(), false);
  assert.equal(h.handling('karta'), true);
  assert.equal(h.handling('sok'), false);
  assert.equal(h.handling('karta'), false);
  assert.equal(h.harHandlat(), true);
  assert.deepEqual(skickat, [['forsta_handling', { typ: 'karta' }]]);
});

test('kartan räknas som ritad en gång, hur många gånger den än ritas om', () => {
  const { skickat, skicka } = fangare();
  const h = skapaHandelser(skicka);
  h.kartaRitad(2500);
  h.kartaRitad(9000);
  assert.deepEqual(skickat, [['karta_ritad', { tid: '2 till 4 s' }]]);
});

test('en sida som låg i en flik som inte syntes säger det, i stället för en tid', () => {
  // En dold flik ritar inga bildrutor. Tjugo sekunder där är inte tjugo sekunders väntan.
  const { skickat, skicka } = fangare();
  skapaHandelser(skicka).kartaRitad(20000, true);
  assert.deepEqual(skickat, [['karta_ritad', { tid: 'i bakgrunden' }]]);
});

test('öppnad organisation, länk ut och Lägg till räknas varje gång', () => {
  const { skickat, skicka } = fangare();
  const h = skapaHandelser(skicka);
  h.orgOppnad('lista');
  h.orgOppnad('karta');
  h.utlank('webbplats');
  h.laggTill('panel');
  assert.deepEqual(skickat, [
    ['org_oppnad', { via: 'lista' }],
    ['org_oppnad', { via: 'karta' }],
    ['utlank', { mal: 'webbplats' }],
    ['lagg_till', { fran: 'panel' }],
  ]);
});

test('bara kända händelser med kända värden är tillåtna', () => {
  assert.equal(tillaten('forsta_handling', { typ: 'filter' }), true);
  assert.equal(tillaten('karta_ritad', { tid: 'under 2 s' }), true);
  assert.equal(tillaten('okand', { typ: 'filter' }), false);
  assert.equal(tillaten('forsta_handling', { typ: 'något annat' }), false);
  assert.equal(tillaten('forsta_handling', { typ: 'filter', q: 'drönare' }), false);
  assert.equal(tillaten('forsta_handling', {}), false);
  assert.equal(tillaten('forsta_handling', { typ: 7 }), false);
});

test('söktext, filterval och organisationens namn kan aldrig följa med en händelse', () => {
  // Löftet på integritetssidan: det du söker på och filtrerar lämnar inte webbläsaren.
  const anrop = [];
  const skicka = tillVercel({ va: (...argument) => anrop.push(argument) });
  skicka('org_oppnad', { via: 'ai-sweden' });
  skicka('forsta_handling', { typ: 'sok', q: 'hemlig sökning' });
  skicka('utlank', { mal: 'https://example.se' });
  assert.deepEqual(anrop, []);
  skicka('org_oppnad', { via: 'sok' });
  assert.deepEqual(anrop, [['event', { name: 'org_oppnad', data: { via: 'sok' } }]]);
});

test('utan räkneskript händer ingenting', () => {
  // Lokalt, i förhandsvisningar och hos den som har bett att inte bli spårad finns ingen räkning.
  const skicka = tillVercel({});
  assert.doesNotThrow(() => skicka('forsta_handling', { typ: 'karta' }));
});

test('ingen händelse bär fler än två egenskaper', () => {
  // Vercels gräns på Pro. En tredje egenskap skulle tyst falla bort.
  for (const [namn, egenskaper] of Object.entries(HANDELSER)) {
    assert.ok(Object.keys(egenskaper).length <= 2, `${namn} har för många egenskaper`);
  }
});
