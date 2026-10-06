// Tester för det långa formuläret ("Lägg in hela posten själv").
//   npm test
// Skriptet körs mot en tillfällig katalog, aldrig mot repots egen data.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const SKRIPT = path.join(import.meta.dirname, 'ny-organisation.mjs');
const REPO = path.join(import.meta.dirname, '..');

function arende(namn) {
  return [
    '### Namn', '', namn, '',
    '### Webbplats', '', 'https://exempelbolaget.se', '',
    '### Organisationstyp', '', 'bolag', '',
    '### Vad bygger ni med AI?', '', 'Bygger ett verktyg som sorterar dokument.', '',
    '### Belägg – länk till något ni byggt med AI', '', 'https://exempelbolaget.se/produkt', '',
  ].join('\n');
}

/** Kör skriptet i en tom kopia av datakatalogen och ger tillbaka utfallet. */
function kor(namn, befintliga = {}) {
  const rot = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-kartan-'));
  fs.cpSync(path.join(REPO, 'data', 'taxonomi'), path.join(rot, 'data', 'taxonomi'), { recursive: true });
  fs.mkdirSync(path.join(rot, 'data', 'organisationer'), { recursive: true });
  for (const [fil, text] of Object.entries(befintliga)) fs.writeFileSync(path.join(rot, 'data', 'organisationer', fil), text);
  const utdata = path.join(rot, 'github-output.txt');
  fs.writeFileSync(utdata, '');
  const svar = spawnSync(process.execPath, [SKRIPT, '--fran-arende'], {
    cwd: rot,
    encoding: 'utf8',
    env: { ...process.env, AI_KARTAN_ROT: rot, ISSUE_BODY: arende(namn), ISSUE_NUMBER: '7', GITHUB_OUTPUT: utdata },
  });
  const las = (fil) => {
    const p = path.join(rot, 'data', 'organisationer', fil);
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
  };
  return { kod: svar.status, stderr: svar.stderr, las, utdata: fs.readFileSync(utdata, 'utf8') };
}

test('en ny organisation blir en fil med id efter namnet', () => {
  const r = kor('Exempelbolaget');
  assert.equal(r.kod, 0, r.stderr);
  assert.match(r.las('exempelbolaget.yaml'), /^id: exempelbolaget$/m);
});

test('en post som redan finns skrivs inte över', () => {
  const ORORD = 'id: exempelbolaget\n# befintlig post\n';
  const r = kor('Exempelbolaget', { 'exempelbolaget.yaml': ORORD });
  assert.notEqual(r.kod, 0);
  assert.match(r.stderr, /finns redan/);
  assert.equal(r.las('exempelbolaget.yaml'), ORORD);
});

test('namnet som går vidare till commit och rubrik saknar hakparenteser', () => {
  const r = kor('Foo [skip ci]');
  assert.equal(r.kod, 0, r.stderr);
  const namnrad = r.utdata.split('\n').find((rad) => rad.startsWith('namn='));
  assert.ok(namnrad, 'namn saknas i utdatan');
  assert.doesNotMatch(namnrad, /[\[\]]/);
});
