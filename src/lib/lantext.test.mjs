// Tester för texterna som gör ett län delbart.
//   npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import { hittillsBelagda, datalage, kortAdress, lancitat, bildtext, tipsfraga } from './lantext.ts';

test('en organisation är belagd, flera är belagda', () => {
  assert.equal(hittillsBelagda(1), '1 organisation, hittills belagd');
  assert.equal(hittillsBelagda(15), '15 organisationer, hittills belagda');
});

test('läget är den senaste dagen, och tidsdelen räknas inte', () => {
  assert.equal(datalage(['2026-10-04', null, '2026-10-14T11:48:06Z', undefined, 'fel']), '2026-10-14');
  assert.equal(datalage([null]), null);
});

test('adressen skrivs utan protokoll och avslutande snedstreck', () => {
  assert.equal(kortAdress('https://karta.opensverige.se/'), 'karta.opensverige.se');
});

test('citatet säger antal, län, dag, adress och licens', () => {
  assert.equal(
    lancitat(15, 'Västerbottens län', '14 okt 2026', 'https://karta.opensverige.se/lan/vasterbottens-lan'),
    '15 organisationer bygger AI i Västerbottens län, enligt OpenSverige AI-kartan (läget 14 okt 2026). karta.opensverige.se/lan/vasterbottens-lan. Data: CC BY 4.0.',
  );
  assert.match(lancitat(1, 'Värmlands län', '14 okt 2026', 'https://x.se'), /^1 organisation bygger AI/);
});

test('alt-texten räknar upp kommunerna', () => {
  assert.equal(
    bildtext(15, 'Västerbottens län', [{ namn: 'Umeå', antal: 11 }, { namn: 'Skellefteå', antal: 4 }], '14 okt 2026'),
    'Karta över Västerbottens län med en prick per kommun. 15 organisationer, hittills belagda: Umeå 11, Skellefteå 4. Läget 14 okt 2026.',
  );
});

test('tipsfrågan nämner länet', () => {
  assert.equal(tipsfraga('Gotlands län'), 'Vet du fler i Gotlands län?');
});
