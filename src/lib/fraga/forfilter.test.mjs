// Tester för förfiltret: frågor som aldrig ska till modellen, och reserven utan modell.
//   npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import { arManniska, faqUtanModell, forfilter, arInfrafraga } from './forfilter.ts';

test('forfilter fångar ranking', () => {
  assert.equal(forfilter('Vilket är Sveriges bästa AI-bolag?'), 'ranking');
  assert.equal(forfilter('Which is the leading AI company?'), 'ranking');
});

test('forfilter fångar kontakt', () => {
  assert.equal(forfilter('Introducera mig till vd:n för Sinch'), 'kontakt');
  assert.equal(forfilter('Ge mig telefonnumret till dem'), 'kontakt');
});

test('forfilter fångar OpenSverige', () => {
  assert.equal(forfilter('Måste jag vara medlem för Discord?'), 'opensverige');
});

test('forfilter fångar sådant utanför ämnet', () => {
  assert.equal(forfilter('Vad blir det för väder imorgon?'), 'utanfor');
});

test('forfilter släpper vanliga frågor', () => {
  assert.equal(forfilter('Vilka bygger röstagenter?'), null);
  assert.equal(forfilter('AI inom hälsa i Göteborg'), null);
  // "toppen" är inte "topp" som helt ord.
  assert.equal(forfilter('Toppen, tack!'), null);
});

test('faqUtanModell träffar kostnad och medlemskap, annars standardfrågan', () => {
  const kostar = faqUtanModell('Kostar medlemskap något?');
  assert.ok(kostar.includes('kostnad'));
  assert.ok(kostar.includes('bli-medlem'));
  assert.deepEqual(faqUtanModell('Hej OpenSverige'), ['vad-ar-opensverige']);
});

test('arManniska ser en människa att bolla med, inte en kartfråga', () => {
  assert.equal(arManniska('Jag behöver någon att bolla SIP med'), true);
  assert.equal(arManniska('Vilka bygger röstagenter?'), false);
});

test('arInfrafraga ser en fråga om GPU, hosting eller inferens', () => {
  for (const fraga of ['Ja behöver hyra GPU', 'Jag behöver GPU-kapacitet i Sverige', 'Var kan vi hosta en modell?', 'Svensk molntjänst för inferens', 'Datacenter i Norrland', 'compute for training', 'Vem har H100?']) {
    assert.equal(arInfrafraga(fraga), true, fraga);
  }
  for (const fraga of ['Vilka bygger röstagenter på svenska?', 'AI inom hälsa i Göteborg', 'Vad är OpenSverige?', 'Grupp som bolla idéer']) {
    assert.equal(arInfrafraga(fraga), false, fraga);
  }
});
