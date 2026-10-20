// Tester för delningsbilden: att typsnitten har alla tecken och att länens namn ryms.
//   npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { lasTypsnitt, saknadeTecken, textbredd, passandeStorlek, delningsbildSvg, lanritning, KARTRUTA } from './delningsbild.ts';

const lan = JSON.parse(fs.readFileSync(new URL('../../data/geo/lan.json', import.meta.url), 'utf8'));
const rubrik = lasTypsnitt('BricolageGrotesque-latin.woff2');
const mono = lasTypsnitt('JetBrainsMono-latin.woff2');

test('rubrikens typsnitt har alla tecken i alla 21 läns namn', () => {
  for (const l of lan) assert.deepEqual(saknadeTecken(rubrik, `AI i ${l.namn} 0123456789 organisationer`), [], l.namn);
});

test('monotypsnittet har tecknen i bildens rader', () => {
  assert.deepEqual(saknadeTecken(mono, 'karta.opensverige.se hittills belagda belagd · läget 14 okt 2026 Källa och datum på varje uppgift jan feb mars april maj juni juli aug sep nov dec'), []);
});

test('det längsta länsnamnet ryms bredvid kartan', () => {
  const bredd = KARTRUTA.x - 64 - 40;
  const langst = lan.map((l) => l.namn).sort((a, b) => textbredd(rubrik, b, 56) - textbredd(rubrik, a, 56))[0];
  const s = passandeStorlek(rubrik, [langst], bredd, 92, 56);
  assert.ok(textbredd(rubrik, langst, s) <= bredd, `${langst} i ${s} px`);
});

test('bilden har länets namn som banor, inte som text', () => {
  const karta = lanritning('17', [{ kod: '1780', namn: 'Karlstad', slug: 'karlstad', lat: 59.38, lng: 13.5, antal: 1 }], { maxBredd: 470, maxHojd: 550, marginal: 30, radie: { min: 12, steg: 6, max: 56 } });
  const svg = delningsbildSvg({ namn: 'Värmlands län', n: 1, lage: '14 okt 2026', adress: 'https://karta.opensverige.se', karta });
  assert.match(svg, /^<svg[^>]+width="1200" height="630"/);
  assert.doesNotMatch(svg, /<text/);
  assert.equal((svg.match(/<circle/g) ?? []).length, 1);
});
