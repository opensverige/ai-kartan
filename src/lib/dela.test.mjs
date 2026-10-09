// Tester för delningen: texten som föreslås och adressen till varje kanal.
//   npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import { delatext, delalank, kanaladress, inlagg, ANKARE_VI } from './dela.ts';

const d = { namn: 'Åre & Söner AB', text: 'Vi finns nu på kartan. 100 % öppet!', url: 'https://karta.opensverige.se/organisation/are-soner' };

test('vi-formen nämner inte namnet, den andra formen börjar med det', () => {
  assert.match(delatext('Berget AI', true), /^Vi finns nu på Tech Embassy/);
  assert.match(delatext('Berget AI', false), /^Berget AI finns på Tech Embassy/);
});

test('delalänken är permalänken med ankaret som öppnar bladet', () => {
  assert.equal(delalank(d.url), `${d.url}#${ANKARE_VI}`);
});

test('varje kanal får text och länk kodade, så att å, & och % kommer fram hela', () => {
  for (const kanal of ['linkedin', 'x', 'bluesky', 'epost']) {
    const adress = kanaladress(kanal, d);
    const fraga = adress.slice(adress.indexOf('?') + 1);
    const varden = [...new URLSearchParams(fraga).values()].join('\n');
    assert.ok(varden.includes(d.text), `${kanal} saknar texten`);
    assert.ok(!fraga.includes(' '), `${kanal} har ett okodat mellanslag`);
  }
});

test('länken som sprids är permalänken, aldrig den med ankare', () => {
  for (const kanal of ['linkedin', 'x', 'bluesky', 'facebook', 'epost']) {
    const adress = decodeURIComponent(kanaladress(kanal, d));
    assert.ok(adress.includes(d.url), `${kanal} saknar länken`);
    assert.ok(!adress.includes(ANKARE_VI), `${kanal} sprider ankaret`);
  }
});

test('Facebook får bara länken', () => {
  assert.equal(kanaladress('facebook', d), `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(d.url)}`);
});

test('e-postens ämne bär organisationens namn', () => {
  const p = new URLSearchParams(kanaladress('epost', d).slice('mailto:?'.length));
  assert.equal(p.get('subject'), 'Åre & Söner AB på Tech Embassy');
});

test('inlägget är texten, en tom rad och länken', () => {
  assert.equal(inlagg(d), `${d.text}\n\n${d.url}`);
});
