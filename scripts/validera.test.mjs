// Tester för valideringen, körd som i CI.
//   npm test
// Skriptet körs mot en tillfällig katalog, aldrig mot repots egen data.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import YAML from 'yaml';

const SKRIPT = path.join(import.meta.dirname, 'validera.mjs');
const REPO = path.join(import.meta.dirname, '..');
const GRUND = YAML.parse(fs.readFileSync(path.join(REPO, 'data', 'organisationer', 'accounted.yaml'), 'utf8'));

/** En giltig post med eget id och egen webbplats. `andra` får ändra den. */
function post(id, webbplats, andra = () => {}) {
  const p = structuredClone(GRUND);
  p.id = id;
  p.website = webbplats;
  p.evidence = [{ ...p.evidence[0], url: `${webbplats.replace(/\/+$/, '')}/produkt-${id}` }];
  delete p.links;
  andra(p);
  return p;
}

/** Kör valideringen på posterna, alla eller bara de `valda`, och ger tillbaka kod och text. */
function validera(poster, valda = []) {
  const rot = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-kartan-validera-'));
  try {
    for (const del of ['schema', path.join('data', 'taxonomi'), path.join('data', 'geo')]) fs.cpSync(path.join(REPO, del), path.join(rot, del), { recursive: true });
    fs.mkdirSync(path.join(rot, 'data', 'organisationer'), { recursive: true });
    for (const p of poster) fs.writeFileSync(path.join(rot, 'data', 'organisationer', `${p.id}.yaml`), YAML.stringify(p, { lineWidth: 0 }));
    const svar = spawnSync(process.execPath, [SKRIPT, ...valda.map((id) => `data/organisationer/${id}.yaml`)], { cwd: rot, encoding: 'utf8', env: { ...process.env, AI_KARTAN_ROT: rot } });
    return { kod: svar.status, text: svar.stdout + svar.stderr };
  } finally {
    fs.rmSync(rot, { recursive: true, force: true });
  }
}

test('en giltig post går igenom', () => {
  const r = validera([post('ett', 'https://ett.example')]);
  assert.equal(r.kod, 0, r.text);
});

test('ett samordningsnummer räknas som personnummer', () => {
  // Födelsedagen plus 60. Förut gick det igenom, eftersom dagen 61 inte finns i en månad.
  for (const nummer of ['850161-1234', '8501611234', '19850161-1234', '850101-1234']) {
    const r = validera([post('ett', 'https://ett.example', (p) => (p.org_number.value = nummer))]);
    assert.notEqual(r.kod, 0, nummer);
    assert.match(r.text, /personnummer/i, nummer);
  }
});

test('samma webbplats med och utan www är samma organisation', () => {
  const r = validera([post('ett', 'https://www.ett.example/'), post('tva', 'https://ett.example')]);
  assert.notEqual(r.kod, 0);
  assert.match(r.text, /används redan/);
});

test('en dubblett hittas även när bara den nya filen valideras', () => {
  // Så körs valideringen när ärendeformuläret blir en pull request.
  const poster = [post('ett', 'https://ett.example'), post('tva', 'https://ett.example')];
  const r = validera(poster, ['tva']);
  assert.notEqual(r.kod, 0, r.text);
  assert.match(r.text, /används redan i ett\.yaml/);
  // Och en fil utan dubblett går fortfarande igenom ensam.
  assert.equal(validera([post('ett', 'https://ett.example'), post('tva', 'https://tva.example')], ['tva']).kod, 0);
});

test('två organisationer på samma värd med olika sökväg är inte dubbletter', () => {
  const r = validera([post('ett', 'https://universitet.example/ett'), post('tva', 'https://universitet.example/tva')]);
  assert.equal(r.kod, 0, r.text);
});

test('en personprofil på LinkedIn stoppas', () => {
  const med = (adress) => validera([post('ett', 'https://ett.example', (p) => (p.links = { linkedin: adress }))]);
  const person = med('https://www.linkedin.com/in/anna-exempel-1a2b3c');
  assert.notEqual(person.kod, 0);
  assert.match(person.text, /personprofil/);
  for (const ok of ['https://www.linkedin.com/company/exempel', 'https://se.linkedin.com/company/exempel/', 'https://linkedin.com/school/exempel']) assert.equal(med(ok).kod, 0, ok);
});
