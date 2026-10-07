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

/** Ärendetext så som GitHub skriver ut det långa formuläret. `falt` byter ut eller lägger till fält. */
function arende(namn, falt = {}) {
  const alla = {
    Namn: namn,
    Webbplats: 'https://exempelbolaget.se',
    Organisationstyp: 'bolag',
    'Vad bygger ni med AI?': 'Bygger ett verktyg som sorterar dokument.',
    'Belägg – länk till något ni byggt med AI': 'https://exempelbolaget.se/produkt',
    ...falt,
  };
  return Object.entries(alla).flatMap(([rubrik, varde]) => [`### ${rubrik}`, '', varde, '']).join('\n');
}

/** Kör skriptet i en tom kopia av datakatalogen och ger tillbaka utfallet. */
function kor(namn, befintliga = {}, falt = {}) {
  const rot = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-kartan-'));
  fs.cpSync(path.join(REPO, 'data', 'taxonomi'), path.join(rot, 'data', 'taxonomi'), { recursive: true });
  fs.mkdirSync(path.join(rot, 'data', 'organisationer'), { recursive: true });
  for (const [fil, text] of Object.entries(befintliga)) fs.writeFileSync(path.join(rot, 'data', 'organisationer', fil), text);
  const utdata = path.join(rot, 'github-output.txt');
  fs.writeFileSync(utdata, '');
  fs.cpSync(path.join(REPO, 'data', 'geo'), path.join(rot, 'data', 'geo'), { recursive: true });
  const rensad = path.join(rot, 'kropp.md');
  const felfil = path.join(rot, 'fel.md');
  const svar = spawnSync(process.execPath, [SKRIPT, '--fran-arende', '--rensad', rensad, '--fel', felfil], {
    cwd: rot,
    encoding: 'utf8',
    env: { ...process.env, AI_KARTAN_ROT: rot, ISSUE_BODY: arende(namn, falt), ISSUE_NUMBER: '7', GITHUB_OUTPUT: utdata },
  });
  const valfri = (fil) => (fs.existsSync(fil) ? fs.readFileSync(fil, 'utf8') : null);
  const las = (fil) => {
    const p = path.join(rot, 'data', 'organisationer', fil);
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
  };
  return { kod: svar.status, stderr: svar.stderr, las, utdata: fs.readFileSync(utdata, 'utf8'), rensad: valfri(rensad), fel: valfri(felfil), filer: fs.readdirSync(path.join(rot, 'data', 'organisationer')) };
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

const BEFINTLIG = (id, namn, webbplats) => `id: ${id}\nname:\n  value: ${namn}\nwebsite: ${webbplats}\n`;

test('ett personnummer i organisationsnumret tas bort ur ärendet, och ingen post skapas', () => {
  // Ett personnummer som organisationsnummer betyder enskild firma, och sådana tas inte emot än.
  // Sista numren är ett samordningsnummer, ett momsnummer och ett med tankstreck från en telefon.
  for (const nummer of ['850101-1234', '8501011234', '19850101-1234', '850161-1234', 'SE850101123401', '850101–1234', '850101 - 1234']) {
    const r = kor('Ny Firma', {}, { Organisationsnummer: nummer });
    assert.notEqual(r.kod, 0, nummer);
    assert.match(r.utdata, /^rensad=true$/m, nummer);
    assert.ok(r.rensad, `${nummer} gav ingen rensad ärendetext`);
    assert.doesNotMatch(r.rensad.replace(/\D/g, ''), /85016?11234|8501011234/, `${nummer} står kvar i ärendetexten`);
    assert.match(r.rensad, /^https:\/\/exempelbolaget\.se$/m, 'resten av ärendet ska stå kvar');
    assert.deepEqual(r.filer, [], `${nummer} gav ändå en fil`);
    assert.match(r.fel, /enskild firma/i);
    assert.match(r.fel, /tagits bort ur ärendet/);
    assert.doesNotMatch(r.fel, /\d{4}/, 'svaret får inte upprepa numret');
  }
});

test('ett personnummer i namnet tas bort ur ärendet, och ingen post skapas', () => {
  // Förut blev det en post som hette "[borttaget]".
  const r = kor('Firma 850101-1234', {}, {});
  assert.notEqual(r.kod, 0);
  assert.match(r.utdata, /^rensad=true$/m);
  assert.ok(!r.rensad.includes('850101'));
  assert.doesNotMatch(r.utdata, /850101/);
  assert.deepEqual(r.filer, []);
  assert.match(r.fel, /namnet/i);
});

test('ett vanligt organisationsnummer följer med och får sitt bindestreck', () => {
  for (const nummer of ['556677-8899', '5566778899']) {
    const r = kor('Ny Firma', {}, { Organisationsnummer: nummer });
    assert.equal(r.kod, 0, r.stderr);
    assert.match(r.las('ny-firma.yaml'), /value: "?556677-8899"?/);
    assert.match(r.utdata, /^rensad=false$/m);
    assert.equal(r.rensad, null);
  }
});

test('en post som redan finns ger ett svar som går att visa i ärendet', () => {
  const r = kor('Exempelbolaget', { 'exempelbolaget.yaml': BEFINTLIG('exempelbolaget', 'Exempelbolaget', 'https://exempelbolaget.se') });
  assert.notEqual(r.kod, 0);
  assert.ok(r.fel, 'inget svar skrevs');
  assert.match(r.fel, /finns redan/);
  assert.match(r.fel, /organisation\/exempelbolaget/);
});

test('samma organisation under ett annat namn stoppas på webbplatsen', () => {
  // Med och utan www, och med avslutande snedstreck, är samma webbplats.
  const r = kor('Exempelbolaget Sverige AB', { 'exempelbolaget.yaml': BEFINTLIG('exempelbolaget', 'Exempelbolaget', 'https://www.exempelbolaget.se/') });
  assert.notEqual(r.kod, 0);
  assert.match(r.fel, /redan finnas på kartan/);
  assert.match(r.fel, /organisation\/exempelbolaget/);
  assert.equal(r.las('exempelbolaget-sverige-ab.yaml'), null);
});

test('kommunen känns igen även i genitiv och med ordet kommun', () => {
  for (const skrivet of ['Stockholm', 'Stockholms kommun', 'stockholm kommun', 'Göteborgs Stad']) {
    const r = kor('Ny Firma', {}, { 'Kommun där organisationen har sitt säte': skrivet });
    assert.equal(r.kod, 0, r.stderr);
    assert.match(r.las('ny-firma.yaml'), new RegExp(`value: "${skrivet.toLowerCase().startsWith('g') ? '1480' : '0180'}"`), skrivet);
  }
  // En kommun vars namn slutar på s ska inte tappa sitt s.
  assert.match(kor('Ny Firma', {}, { 'Kommun där organisationen har sitt säte': 'Borås' }).las('ny-firma.yaml'), /value: "1490"/);
});
