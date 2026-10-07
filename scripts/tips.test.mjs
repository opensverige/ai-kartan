// Tester för det korta formuläret "Lägg till en organisation".
//   npm test
// Körs med Nodes inbyggda testkörare, utan beroenden.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import YAML from 'yaml';
import { parsa, ikryssade } from './lib/arende.mjs';
import { bedomTips, skrivSvar } from './lib/tips.mjs';

const SKRIPT = path.join(import.meta.dirname, 'tips.mjs');
const MALL = path.join(import.meta.dirname, '..', '.github', 'ISSUE_TEMPLATE', '1-lagg-till.yml');
const ENSKILD_RUTA = 'Det gäller en enskild firma och jag är personen själv.';

/** Ärendetext så som GitHub skriver ut ett ifyllt formulär. */
function arende({ namn = 'Exempelbolaget', webbplats = 'https://exempelbolaget.se', belagg = 'https://exempelbolaget.se/produkt', orgnr = '_No response_', enskild = false } = {}) {
  return [
    '### Namn', '', namn, '',
    '### Webbplats', '', webbplats, '',
    '### Länk till något ni byggt med AI', '', belagg, '',
    '### Organisationsnummer (valfritt)', '', orgnr, '',
    '### Enskild firma', '', `- [${enskild ? 'x' : ' '}] ${ENSKILD_RUTA}`, '',
  ].join('\n');
}

const BEFINTLIGA = [
  { id: 'exempelbolaget', namn: 'Exempelbolaget AB', webbplats: 'https://exempelbolaget.se' },
  { id: 'annan-org', namn: 'Annan Org', webbplats: 'https://github.com/annan-org' },
];
const LANKAR = { sajt: 'https://karta.example', repo: 'https://github.com/exempel/karta' };

test('parsa delar upp formuläret per rubrik och läser "_No response_" som tomt', () => {
  const f = parsa(arende({ namn: 'Nytt Bolag' }));
  assert.equal(f['Namn'], 'Nytt Bolag');
  assert.equal(f['Organisationsnummer (valfritt)'], '');
});

test('ikryssade ger bara de rutor som är ikryssade', () => {
  assert.deepEqual(ikryssade('- [x] Första\n- [ ] Andra\n- [X] Tredje'), ['Första', 'Tredje']);
});

test('formuläret på GitHub och läsaren är överens om rubrikerna', () => {
  // Bygger ärendetexten ur den riktiga mallen, så som GitHub gör: en rubrik per fält.
  const svar = { namn: 'Mallbolaget', webbplats: 'https://mallbolaget.se', belagg: 'https://mallbolaget.se/demo', organisationsnummer: '556677-8899' };
  const falt = YAML.parse(fs.readFileSync(MALL, 'utf8')).body.filter((b) => b.type !== 'markdown');
  const kropp = falt
    .map((b) => `### ${b.attributes.label}\n\n${b.type === 'checkboxes' ? b.attributes.options.map((o) => `- [x] ${o.label}`).join('\n') : svar[b.id]}\n`)
    .join('\n');
  const r = bedomTips(kropp, []);
  assert.deepEqual(r.tips, { namn: 'Mallbolaget', webbplats: 'https://mallbolaget.se', belagg: 'https://mallbolaget.se/demo', orgnr: '', enskild: true });
  assert.ok(r.rensadKropp && !r.rensadKropp.includes('556677-8899'));
});

test('ett komplett tips läses utan anmärkning', () => {
  const r = bedomTips(arende({ namn: 'Nytt Bolag', webbplats: 'https://nyttbolag.se', belagg: 'https://nyttbolag.se/demo' }), BEFINTLIGA);
  assert.deepEqual(r.tips, { namn: 'Nytt Bolag', webbplats: 'https://nyttbolag.se', belagg: 'https://nyttbolag.se/demo', orgnr: '', enskild: false });
  assert.deepEqual(r.fel, []);
  assert.equal(r.dubblett, null);
  assert.equal(r.rensadKropp, null);
});

test('en webbplats utan https:// godtas', () => {
  const r = bedomTips(arende({ namn: 'Nytt Bolag', webbplats: 'nyttbolag.se', belagg: 'nyttbolag.se/demo' }), BEFINTLIGA);
  assert.equal(r.tips.webbplats, 'https://nyttbolag.se');
  assert.deepEqual(r.fel, []);
});

test('text som inte är en länk i webbplatsfältet ger ett fel', () => {
  for (const webbplats of ['finns ingen', 'nyttbolag', '_No response_']) {
    const r = bedomTips(arende({ namn: 'Nytt Bolag', webbplats, belagg: 'https://nyttbolag.se/demo' }), BEFINTLIGA);
    assert.equal(r.fel.length, 1, `"${webbplats}" skulle ge ett fel`);
  }
});

test('ett tips utan länk till något byggt ger ett fel', () => {
  const r = bedomTips(arende({ namn: 'Nytt Bolag', webbplats: 'https://nyttbolag.se', belagg: '_No response_' }), BEFINTLIGA);
  assert.equal(r.fel.length, 1);
});

test('samma webbplats är en dubblett oavsett www, versaler och snedstreck', () => {
  const r = bedomTips(arende({ namn: 'Något annat namn', webbplats: 'https://WWW.Exempelbolaget.se/' }), BEFINTLIGA);
  assert.deepEqual(r.dubblett, { id: 'exempelbolaget', namn: 'Exempelbolaget AB' });
});

test('en undersida på en befintlig organisations webbplats är en dubblett', () => {
  const r = bedomTips(arende({ namn: 'Något annat namn', webbplats: 'https://exempelbolaget.se/om-oss' }), BEFINTLIGA);
  assert.equal(r.dubblett?.id, 'exempelbolaget');
});

test('två organisationer på samma värd med olika sökväg är inte dubbletter', () => {
  const r = bedomTips(arende({ namn: 'Ny Org', webbplats: 'https://github.com/ny-org', belagg: 'https://github.com/ny-org/modell' }), BEFINTLIGA);
  assert.equal(r.dubblett, null);
});

test('samma namn är en dubblett oavsett versaler och bolagsform', () => {
  const r = bedomTips(arende({ namn: 'exempelbolaget', webbplats: 'https://helt-annan-adress.se' }), BEFINTLIGA);
  assert.equal(r.dubblett?.id, 'exempelbolaget');
});

test('ett organisationsnummer för en juridisk person får stå kvar', () => {
  const r = bedomTips(arende({ namn: 'Nytt Bolag', webbplats: 'https://nyttbolag.se', orgnr: '556677-8899' }), BEFINTLIGA);
  assert.equal(r.tips.orgnr, '556677-8899');
  assert.equal(r.rensadKropp, null);
});

test('ett nummer som ser ut som ett personnummer tas bort ur ärendet', () => {
  // Sista raden är ett samordningsnummer: födelsedagen plus 60.
  for (const nummer of ['850101-1234', '8501011234', '19850101-1234', '198501011234', '850161-1234']) {
    const r = bedomTips(arende({ namn: 'Ny Firma', webbplats: 'https://nyfirma.se', orgnr: nummer }), BEFINTLIGA);
    assert.equal(r.tips.orgnr, '', `${nummer} skulle inte följa med`);
    assert.ok(r.rensadKropp, `${nummer} skulle ge en rensad ärendetext`);
    assert.ok(!r.rensadKropp.includes(nummer), `${nummer} står kvar i ärendetexten`);
    assert.match(r.rensadKropp, /^https:\/\/nyfirma\.se$/m, 'resten av ärendet ska stå kvar');
  }
});

test('för en enskild firma tas organisationsnumret alltid bort', () => {
  const r = bedomTips(arende({ namn: 'Ny Firma', webbplats: 'https://nyfirma.se', orgnr: '556677-8899', enskild: true }), BEFINTLIGA);
  assert.equal(r.tips.enskild, true);
  assert.equal(r.tips.orgnr, '');
  assert.ok(r.rensadKropp && !r.rensadKropp.includes('556677-8899'));
});

test('ett personnummer i namnfältet tas också bort', () => {
  const r = bedomTips(arende({ namn: 'Firma 850101-1234', webbplats: 'https://nyfirma.se' }), BEFINTLIGA);
  assert.ok(r.rensadKropp && !r.rensadKropp.includes('850101-1234'));
});

test('svaret på en dubblett länkar till den befintliga posten', () => {
  const r = bedomTips(arende({ webbplats: 'https://exempelbolaget.se' }), BEFINTLIGA);
  assert.match(skrivSvar(r, LANKAR), /verkar redan finnas på kartan: https:\/\/karta\.example\/organisation\/exempelbolaget$/m);
});

test('svaret upprepar aldrig det tipsaren skrev', () => {
  const kropp = arende({ namn: '@alla kolla in detta', webbplats: 'https://nyfirma.se', belagg: 'https://nyfirma.se/hemlig-sida', orgnr: '850101-1234' });
  const svar = skrivSvar(bedomTips(kropp, BEFINTLIGA), LANKAR);
  for (const text of ['@alla', 'hemlig-sida', '850101-1234']) assert.ok(!svar.includes(text), `svaret innehåller "${text}"`);
});

test('svaret skiljer på ett nytt ärende och ett ändrat', () => {
  const r = bedomTips(arende({ namn: 'Nytt Bolag', webbplats: 'https://nyttbolag.se' }), BEFINTLIGA);
  assert.notEqual(skrivSvar(r, LANKAR), skrivSvar(r, { ...LANKAR, andrad: true }));
});

test('skriptet skriver svar och rensad ärendetext, och talar om för flödet att ärendet ska rensas', () => {
  const katalog = fs.mkdtempSync(path.join(os.tmpdir(), 'tips-'));
  const filer = { svar: path.join(katalog, 'svar.md'), rensad: path.join(katalog, 'kropp.md'), ut: path.join(katalog, 'ut.txt') };
  fs.writeFileSync(filer.ut, '');
  try {
    execFileSync(process.execPath, [SKRIPT, '--svar', filer.svar, '--rensad', filer.rensad], {
      env: { ...process.env, ISSUE_BODY: arende({ namn: 'Zzz Provfirma För Test', webbplats: 'https://zzz-provfirma.example.se', orgnr: '850101-1234' }), GITHUB_OUTPUT: filer.ut },
      stdio: 'pipe',
    });
    assert.ok(fs.readFileSync(filer.svar, 'utf8').trim().length > 0);
    assert.ok(!fs.readFileSync(filer.rensad, 'utf8').includes('850101-1234'));
    assert.match(fs.readFileSync(filer.ut, 'utf8'), /^rensad=true$/m);
  } finally {
    fs.rmSync(katalog, { recursive: true, force: true });
  }
});

test('skriptet ber inte flödet rensa när inget nummer tagits bort', () => {
  const katalog = fs.mkdtempSync(path.join(os.tmpdir(), 'tips-'));
  const filer = { svar: path.join(katalog, 'svar.md'), rensad: path.join(katalog, 'kropp.md'), ut: path.join(katalog, 'ut.txt') };
  fs.writeFileSync(filer.ut, '');
  try {
    execFileSync(process.execPath, [SKRIPT, '--svar', filer.svar, '--rensad', filer.rensad], {
      env: { ...process.env, ISSUE_BODY: arende({ namn: 'Zzz Provfirma För Test', webbplats: 'https://zzz-provfirma.example.se' }), GITHUB_OUTPUT: filer.ut },
      stdio: 'pipe',
    });
    assert.match(fs.readFileSync(filer.ut, 'utf8'), /^rensad=false$/m);
    assert.equal(fs.existsSync(filer.rensad), false);
  } finally {
    fs.rmSync(katalog, { recursive: true, force: true });
  }
});

test('utfyllnad i nummerfältet för en enskild firma förstör inte resten av ärendet', () => {
  // Ett streck eller ett "nej" är inget nummer. Förut byttes tecknet ut i hela ärendet, även i länkarna.
  for (const fyll of ['-', '.', 'x', 'nej', 'har inget']) {
    const r = bedomTips(arende({ namn: 'Nord-AI Konsult', webbplats: 'https://nord-ai-konsult.se', belagg: 'https://nord-ai-konsult.se/x', orgnr: fyll, enskild: true }), BEFINTLIGA);
    assert.equal(r.rensadKropp, null, `"${fyll}" ska inte räknas som ett nummer`);
    assert.equal(r.tips.webbplats, 'https://nord-ai-konsult.se');
    assert.equal(r.tips.orgnr, '');
    assert.deepEqual(r.fel, []);
  }
});

test('ett tips om en hel webbplats är inte en dubblett av en organisation på en undersida', () => {
  // Ett lärosätes institution har en undersida som webbplats. Lärosätet självt är en annan organisation.
  const finns = [{ id: 'rpl-kth', namn: 'Robotik, perception och lärande, KTH', webbplats: 'https://www.kth.se/is/rpl' }];
  assert.equal(bedomTips(arende({ namn: 'Kungliga Tekniska högskolan', webbplats: 'https://www.kth.se', belagg: 'https://www.kth.se/ai' }), finns).dubblett, null);
  // Samma undersida är fortfarande en dubblett.
  assert.equal(bedomTips(arende({ namn: 'RPL', webbplats: 'https://kth.se/is/rpl/', belagg: 'https://www.kth.se/ai' }), finns).dubblett?.id, 'rpl-kth');
});

test('svaret på en dubblett hänvisar till en knapp som finns på organisationens sida', () => {
  const r = bedomTips(arende({ webbplats: 'https://exempelbolaget.se' }), BEFINTLIGA);
  const svar = skrivSvar(r, LANKAR);
  assert.match(svar, /Rätta via GitHub/);
  assert.doesNotMatch(svar, /Begär rättelse/);
  // Knappen ska heta likadant på sidan som i svaret.
  const sida = fs.readFileSync(path.join(import.meta.dirname, '..', 'src', 'pages', 'organisation', '[id].astro'), 'utf8');
  assert.match(sida, />Rätta via GitHub</);
});

test('en webbplats som bara skiljer sig på språk eller land är samma webbplats', () => {
  // Posten har sin svenska ingång som webbplats. Ett tips med huvudadressen gäller samma organisation.
  const finns = [
    { id: 'klarna', namn: 'Klarna', webbplats: 'https://www.klarna.com/se/' },
    { id: 'ai-sweden', namn: 'AI Sweden', webbplats: 'https://www.ai.se/sv' },
  ];
  assert.equal(bedomTips(arende({ namn: 'Klarna Bank', webbplats: 'https://www.klarna.com', belagg: 'https://www.klarna.com/ai' }), finns).dubblett?.id, 'klarna');
  assert.equal(bedomTips(arende({ namn: 'Det nationella centret', webbplats: 'https://ai.se/en', belagg: 'https://ai.se/x' }), finns).dubblett?.id, 'ai-sweden');
});

test('personnummer tas bort hur de än är skrivna', () => {
  // Som momsnummer, med tankstreck från en telefon, med mellanslag, punkt eller snedstreck, och med sekelsiffror.
  for (const nummer of ['SE850101123401', '850101 - 1234', '850101–1234', '850101  1234', '850101.1234', '850101/1234', '168501011234', '19850101 1234']) {
    const r = bedomTips(arende({ namn: 'Ny Firma', webbplats: 'https://nyfirma.se', orgnr: nummer }), BEFINTLIGA);
    assert.ok(r.rensadKropp, `${nummer} skulle ge en rensad ärendetext`);
    assert.doesNotMatch(r.rensadKropp.replace(/\D/g, ''), /8501011234/, `${nummer} står kvar i ärendetexten`);
    assert.equal(r.tips.orgnr, '', nummer);
    assert.match(r.rensadKropp, /^https:\/\/nyfirma\.se$/m, 'resten av ärendet ska stå kvar');
  }
});

test('organisationsnummer för juridiska personer rörs aldrig, hur de än är skrivna', () => {
  for (const nummer of ['556677-8899', '5566778899', '202100-2932', '802002-4280', '969600-1234', 'SE556677889901', '556677 8899', '16556677-8899']) {
    const r = bedomTips(arende({ namn: 'Nytt Bolag', webbplats: 'https://nyttbolag.se', orgnr: nummer }), BEFINTLIGA);
    assert.equal(r.rensadKropp, null, `${nummer} togs bort av misstag`);
    assert.equal(r.tips.orgnr, nummer);
  }
});

test('skriptet läser ärendet ur händelsefilen, så att texten aldrig hamnar i körningens logg', () => {
  // GitHub skriver ut stegets env i den publika loggen. Ärendetexten får därför inte skickas den vägen.
  const katalog = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-kartan-tips-'));
  try {
    const handelse = path.join(katalog, 'event.json');
    fs.writeFileSync(handelse, JSON.stringify({ issue: { body: arende({ namn: 'Ny Firma', webbplats: 'https://nyfirma.se', orgnr: '850101-1234' }) } }));
    const miljo = { ...process.env, GITHUB_EVENT_PATH: handelse, GITHUB_OUTPUT: path.join(katalog, 'ut.txt') };
    delete miljo.ISSUE_BODY;
    fs.writeFileSync(miljo.GITHUB_OUTPUT, '');
    execFileSync(process.execPath, [SKRIPT, '--svar', path.join(katalog, 'svar.md'), '--rensad', path.join(katalog, 'kropp.md')], { env: miljo });
    assert.match(fs.readFileSync(miljo.GITHUB_OUTPUT, 'utf8'), /rensad=true/);
    assert.doesNotMatch(fs.readFileSync(path.join(katalog, 'kropp.md'), 'utf8'), /850101/);
  } finally {
    fs.rmSync(katalog, { recursive: true, force: true });
  }
  for (const flode of ['tips.yml', 'ny-organisation.yml']) {
    const text = fs.readFileSync(path.join(import.meta.dirname, '..', '.github', 'workflows', flode), 'utf8');
    assert.doesNotMatch(text, /:\s*\$\{\{\s*github\.event\.issue\.body\s*\}\}/, `${flode} skickar ärendetexten genom env`);
  }
});
