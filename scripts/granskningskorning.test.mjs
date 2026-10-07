// Tester för körningen som skriver granskningslistan och sätter kontrollens läge.
// GitHub är utbytt mot ett låtsas-GitHub i minnet, så inget anrop lämnar datorn.
//   npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { devNull, tmpdir } from 'node:os';
import { join } from 'node:path';
import { kor, jamforTrad, vantetid, ApiFel } from './lib/granskningskorning.mjs';
import { oppna, GitFel } from './lib/granskningsgit.mjs';
import { MARKOR, KONTEXT, PUNKTER } from './lib/granskning.mjs';

const REPO = 'opensverige/ai-kartan';
const ANTAL_NY = PUNKTER.ny.length;
const yaml = (id, webb = 'https://exempel.se') => `id: ${id}\nname:\n  value: Exempel AB\ntype:\n  value: bolag\nwebsite: ${webb}\n`;
const org = (id, extra = {}) => ({ namn: `data/organisationer/${id}.yaml`, text: yaml(id), ...extra });
const BOT = { login: 'github-actions[bot]', type: 'Bot' };
const README = { namn: 'README.md', text: 'hej' };

const GITMILJO = { PATH: process.env.PATH, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: devNull };
const kataloger = [];
test.after(() => kataloger.forEach((k) => rmSync(k, { recursive: true, force: true })));

/**
 * Ett riktigt git-förråd i en tillfällig mapp. `commit` gör en commit av en lista filer
 * ({ namn, text, mode }) med de föräldrar som anges, och ger dess id. Sammanslagningar och
 * historik prövas alltså mot git självt, inte mot en efterbildning.
 */
function forrad() {
  const katalog = mkdtempSync(join(tmpdir(), 'granskningsprov-'));
  kataloger.push(katalog);
  execFileSync('git', ['init', '--quiet', '--bare', katalog], { env: GITMILJO });
  let n = 0;
  const data = (text) => Buffer.concat([Buffer.from(`data ${Buffer.byteLength(text)}\n`), Buffer.from(text), Buffer.from('\n')]);
  const commit = (filer, foraldrar = []) => {
    n += 1;
    const delar = [Buffer.from(`commit refs/prov/c${n}\ncommitter Prov <prov@example.se> ${1_700_000_000 + n} +0000\n`), data(`commit ${n}`)];
    foraldrar.forEach((p, i) => delar.push(Buffer.from(`${i === 0 ? 'from' : 'merge'} ${p}\n`)));
    delar.push(Buffer.from('deleteall\n'));
    for (const f of filer) delar.push(Buffer.from(`M ${f.mode ?? '100644'} inline ${JSON.stringify(f.namn)}\n`), data(f.text ?? ''));
    delar.push(Buffer.from('\n'));
    execFileSync('git', ['fast-import', '--quiet'], { cwd: katalog, env: GITMILJO, input: Buffer.concat(delar) });
    return execFileSync('git', ['rev-parse', `refs/prov/c${n}`], { cwd: katalog, env: GITMILJO }).toString().trim();
  };
  return { katalog, commit, git: oppna(katalog) };
}

/**
 * Ett låtsas-GitHub ovanpå ett riktigt git-förråd. `bas` är filerna i main när pull requesten
 * öppnas och `huvud` filerna i dess första commit.
 * `vid(metod, stig, v)` körs före varje anrop och får ändra läget eller returnera en statuskod att
 * svara med. Anrop till git kommer som metoden GIT med kommandots namn som stig.
 */
function github({ bas = [README], huvud = [README], basgren = 'main', oppen = true, kommentarer = [], ratt = {}, vid = () => null } = {}) {
  let klocka = Date.parse('2026-10-07T12:00:00Z');
  const f = forrad();
  const v = {
    kommentarer: [],
    statusar: [],
    anrop: [],
    nastaId: 5000,
    commit: f.commit,
    /** Tiden går en sekund för varje sak som händer, så att ordningen alltid går att läsa av. */
    nu() {
      klocka += 1000;
      return new Date(klocka).toISOString().replace('.000Z', 'Z');
    },
    /** En ny commit på pull requestens gren. Utan andra föräldrar bygger den på grenens senaste. */
    push(filer, foraldrar = [v.huvud]) {
      v.huvud = f.commit(filer, foraldrar);
      return v.huvud;
    },
    /** En ny commit i main, till exempel en annan pull request som har slagits ihop. */
    main(filer, foraldrar = [v.bas]) {
      v.bas = f.commit(filer, foraldrar);
      return v.bas;
    },
    /** Någon skriver en kommentar. */
    kommentera(login, body, { type = 'User', viaApp = null } = {}) {
      const nar = v.nu();
      const k = { id: v.nastaId++, body, user: { login, type }, created_at: nar, updated_at: nar, html_url: 'https://github.com/x/pull/7#issuecomment-x', performed_via_github_app: viaApp };
      v.kommentarer.push(k);
      return k;
    },
    /** Någon redigerar en kommentar i webbläsaren. */
    redigera(k, andra) {
      k.body = andra(k.body);
      k.updated_at = v.nu();
    },
  };
  v.bas = f.commit(bas);
  // Commiten som pull requesten sägs utgå från. Hos GitHub flyttas den inte när main flyttas.
  const oppnadMot = v.bas;
  v.huvud = v.forsta = f.commit(huvud, [v.bas]);
  for (const k of kommentarer) v.kommentera(k.login, k.body, k);
  const api = async (metod, stig, kropp) => {
    const [rent, fraga = ''] = stig.split('?');
    const kod = vid(metod, rent, v);
    v.anrop.push(`${metod} ${rent}`);
    if (kod) throw new ApiFel(metod, stig, kod);
    const sida = Number(new URLSearchParams(fraga).get('page') ?? 1);
    let m;
    if (metod === 'GET' && /\/pulls\/\d+$/.test(rent)) return { state: oppen ? 'open' : 'closed', html_url: 'https://github.com/x/pull/7', head: { sha: v.huvud }, base: { ref: basgren, sha: oppnadMot, repo: { default_branch: 'main' } } };
    if (metod === 'GET' && /\/git\/ref\/heads\/main$/.test(rent)) return { ref: 'refs/heads/main', object: { type: 'commit', sha: v.bas } };
    if (metod === 'GET' && /\/issues\/\d+\/comments$/.test(rent)) return v.kommentarer.slice((sida - 1) * 100, sida * 100).map((k) => ({ ...k }));
    if (metod === 'GET' && (m = rent.match(/\/issues\/comments\/(\d+)$/))) {
      const k = v.kommentarer.find((x) => x.id === Number(m[1]));
      if (!k) throw new ApiFel(metod, stig, 404);
      return { ...k };
    }
    // Lägen för en commit, nyast först, som hos GitHub.
    if (metod === 'GET' && (m = rent.match(/\/commits\/([0-9a-f]{40})\/statuses$/))) return v.statusar.filter((s) => s.sha === m[1]).reverse().slice((sida - 1) * 100, sida * 100);
    if (metod === 'GET' && (m = rent.match(/\/collaborators\/([^/]+)\/permission$/))) {
      if (!ratt[m[1]]) throw new ApiFel(metod, stig, 404);
      return { permission: ratt[m[1]], role_name: ratt[m[1]], user: { login: m[1], type: 'User' } };
    }
    if (metod === 'POST' && /\/issues\/\d+\/comments$/.test(rent)) return v.kommentera(BOT.login, kropp.body, BOT);
    if (metod === 'PATCH' && (m = rent.match(/\/issues\/comments\/(\d+)$/))) {
      const k = v.kommentarer.find((x) => x.id === Number(m[1]));
      v.redigera(k, () => kropp.body);
      return k;
    }
    if (metod === 'POST' && (m = rent.match(/\/statuses\/([0-9a-f]{40})$/))) {
      v.statusar.push({ sha: m[1], ...kropp });
      return {};
    }
    throw new Error(`Oväntat anrop: ${metod} ${stig}`);
  };
  const git = Object.fromEntries(
    Object.entries(f.git).map(([namn, kommando]) => [
      namn,
      async (...arg) => {
        const kod = vid('GIT', namn, v);
        v.anrop.push(`GIT ${namn}`);
        if (kod) throw new GitFel(namn, kod);
        return kommando(...arg);
      },
    ]),
  );
  return { api, git, v };
}

const grund = (g, extra = {}) => ({ api: g.api, git: g.git, repo: REPO, nummer: 7, logg: () => {}, ...extra });
const listan = (v) => v.kommentarer.find((k) => k.user?.login === BOT.login && String(k.body).startsWith(MARKOR));
const lagen = (v) => v.anrop.filter((a) => a.startsWith('POST') && a.includes('/statuses/')).length;
const sist = (v) => v.statusar.at(-1);
const skrivningar = (v) => v.anrop.filter((a) => !a.startsWith('GET ') && !a.startsWith('GIT '));
const bockad = (kropp, villkor = () => true) => kropp.split('\n').map((rad) => (rad.startsWith('- [ ] ') && villkor(rad) ? rad.replace('- [ ] ', '- [x] ') : rad)).join('\n');
const bocka = (v, villkor) => v.redigera(listan(v), (b) => bockad(b, villkor));
const RATT = { granskare: 'write' };
/** En pull request med en ny organisation, där listan är skriven och allt är avbockat men inte intygat. */
async function avbockad(extra = {}) {
  const g = github({ huvud: [README, org('exempel')], ratt: RATT, ...extra });
  await kor(grund(g));
  bocka(g.v);
  await kor(grund(g));
  return g;
}

test('en ny organisation får en lista och ett gult läge', async () => {
  const g = github({ huvud: [README, org('exempel')] });
  await kor(grund(g));
  assert.equal(listan(g.v).body.split('\n').filter((r) => r.startsWith('- [ ] ')).length, ANTAL_NY);
  assert.deepEqual([sist(g.v).state, sist(g.v).context, sist(g.v).sha], ['pending', KONTEXT, g.v.forsta]);
  assert.match(sist(g.v).description, new RegExp(`0 av ${ANTAL_NY}`));
});

test('avbockat utan intyg är gult, och säger vad som återstår', async () => {
  const g = await avbockad();
  assert.equal(sist(g.v).state, 'pending');
  assert.match(sist(g.v).description, /\/granskad/);
});

test('när en människa med skrivrätt har intygat blir läget grönt', async () => {
  const g = await avbockad();
  const fore = skrivningar(g.v).length;
  g.v.kommentera('granskare', '/granskad');
  await kor(grund(g));
  assert.equal(sist(g.v).state, 'success');
  assert.match(sist(g.v).description, /intygade av granskare/);
  // Listan skrivs inte om när den redan stämmer. Annars skulle intyget sluta gälla.
  assert.deepEqual(skrivningar(g.v).slice(fore), [`POST /repos/${REPO}/statuses/${g.v.forsta}`]);
  // Ett läge som redan står skrivs inte en gång till. GitHub tar bara emot tusen lägen per commit.
  for (let n = 0; n < 5; n++) await kor(grund(g));
  assert.equal(skrivningar(g.v).slice(fore).length, 1);
});

test('en bot som kryssar i rutorna får inte kontrollen grön', async () => {
  // Rutorna är ikryssade, av vem som helst. Utan en människas intyg räcker det inte.
  const g = await avbockad();
  for (let n = 0; n < 3; n++) await kor(grund(g));
  assert.equal(sist(g.v).state, 'pending');
  // Inte heller om boten själv skriver ordet.
  g.v.kommentera('hjalpsam-agent[bot]', '/granskad', { type: 'Bot' });
  g.v.kommentera(BOT.login, '/granskad', BOT);
  await kor(grund(g));
  assert.equal(sist(g.v).state, 'pending');
});

test('ett intyg från någon utan skrivrätt räknas inte', async () => {
  const g = await avbockad({ ratt: { ...RATT, lasare: 'read' } });
  g.v.kommentera('lasare', '/granskad');
  g.v.kommentera('okand', '/granskad');
  await kor(grund(g));
  assert.equal(sist(g.v).state, 'pending');
});

test('en redigerad kommentar är inget intyg', async () => {
  // Den som får skriva i repot kan ändra andras kommentarer. En kommentar som en människa skrev
  // om något annat får därför inte kunna göras om till ett intyg i efterhand.
  const g = await avbockad();
  const k = g.v.kommentera('granskare', 'Ser bra ut hittills.');
  g.v.redigera(k, () => '/granskad');
  await kor(grund(g));
  assert.equal(sist(g.v).state, 'pending');
});

test('ett intyg gäller listan som den såg ut, inte ändringar efteråt', async () => {
  const g = await avbockad();
  g.v.kommentera('granskare', '/granskad');
  await kor(grund(g));
  assert.equal(sist(g.v).state, 'success');
  // Någon bockar ur en ruta och i den igen. Listan är ändrad efter intyget.
  g.v.redigera(listan(g.v), (b) => b.replace('- [x] ', '- [ ] '));
  await kor(grund(g));
  assert.match(sist(g.v).description, new RegExp(`${ANTAL_NY - 1} av ${ANTAL_NY}`));
  bocka(g.v);
  await kor(grund(g));
  assert.equal(sist(g.v).state, 'pending');
  assert.match(sist(g.v).description, /ändrats eller dolts efter intyget/);
  // Ett nytt intyg gör den grön igen.
  g.v.kommentera('granskare', '/granskad');
  await kor(grund(g));
  assert.equal(sist(g.v).state, 'success');
});

test('ett intyg som skrevs före avbockningen gäller inte', async () => {
  const g = github({ huvud: [README, org('exempel')], ratt: RATT });
  await kor(grund(g));
  g.v.kommentera('granskare', '/granskad');
  await kor(grund(g));
  assert.match(sist(g.v).description, new RegExp(`0 av ${ANTAL_NY}`));
  bocka(g.v);
  await kor(grund(g));
  assert.equal(sist(g.v).state, 'pending');
});

test('nytt innehåll i filen nollställer bockarna och intyget', async () => {
  const g = await avbockad();
  g.v.kommentera('granskare', '/granskad');
  await kor(grund(g));
  assert.equal(sist(g.v).state, 'success');
  g.v.push([README, org('exempel', { text: yaml('exempel', 'https://annan.example') })]);
  await kor(grund(g));
  assert.deepEqual([sist(g.v).state, sist(g.v).sha], ['pending', g.v.huvud]);
  assert.match(sist(g.v).description, new RegExp(`0 av ${ANTAL_NY}`));
  assert.match(listan(g.v).body, /annan\.example/);
  // Det gamla intyget räcker inte, ens när rutorna är ikryssade igen.
  bocka(g.v);
  await kor(grund(g));
  assert.equal(sist(g.v).state, 'pending');
});

test('en commit som inte rör filen behåller både bockar och intyg', async () => {
  const g = await avbockad();
  g.v.kommentera('granskare', '/granskad');
  await kor(grund(g));
  const kropp = listan(g.v).body;
  g.v.push([{ namn: 'README.md', text: 'ändrad' }, org('exempel')]);
  await kor(grund(g));
  assert.deepEqual([sist(g.v).state, sist(g.v).sha], ['success', g.v.huvud]);
  assert.equal(listan(g.v).body, kropp);
});

test('skrivs listan om gäller inget äldre intyg, redan i samma körning', async () => {
  const g = await avbockad();
  g.v.kommentera('granskare', '/granskad');
  await kor(grund(g));
  assert.equal(sist(g.v).state, 'success');
  // En ny commit ändrar en regelfil. Organisationens fil är orörd, så bockarna står kvar, men
  // listan får en ny rad och är alltså inte längre den som intygades.
  g.v.push([README, org('exempel'), { namn: 'kriterier.md', text: 'nya kriterier' }]);
  await kor(grund(g));
  assert.match(listan(g.v).body, /ändrar också regelfiler/);
  assert.equal(listan(g.v).body.split('\n').filter((r) => r.startsWith('- [x] ')).length, ANTAL_NY);
  assert.deepEqual([sist(g.v).state, sist(g.v).sha], ['pending', g.v.huvud]);
  assert.match(sist(g.v).description, /ändrats eller dolts efter intyget/);
  // Samma svar nästa gång: läget får inte växla mellan två körningar utan att något har hänt.
  await kor(grund(g));
  assert.equal(sist(g.v).state, 'pending');
});

test('läget gäller alltid den commit som lästes, även om pull requesten flyttas under körningen', async () => {
  // En commit kan inte ändras i efterhand. En ny commit mitt i körningen får därför inte kunna
  // ge grönt åt den gamla: den gamla har fortfarande en organisation i sig.
  for (const nar of ['/git/ref/', 'slaIhop', 'rader', '/issues/7/comments']) {
    let flyttad = false;
    const g = github({
      huvud: [README, org('smyg')],
      vid: (metod, stig, v) => {
        if (!flyttad && stig.includes(nar)) {
          flyttad = true;
          v.push([README]);
        }
        return null;
      },
    });
    await kor(grund(g));
    assert.equal(flyttad, true, nar);
    assert.deepEqual([sist(g.v).state, sist(g.v).sha], ['pending', g.v.forsta], nar);
    assert.match(listan(g.v).body, /`smyg` · ny/, nar);
  }
});

test('en symbolisk länk i mappen gör kontrollen röd', async () => {
  const g = github({ huvud: [README, org('exempel', { mode: '120000', text: 'docs/utkast/a.yaml' })] });
  await kor(grund(g));
  assert.equal(sist(g.v).state, 'failure');
  assert.match(listan(g.v).body, /inte en vanlig fil/);
  assert.equal(listan(g.v).body.includes('- [ ] '), false);
});

test('en fil med otillåtet namn i mappen gör kontrollen röd, inte grön', async () => {
  for (const namn of ['data/organisationer/Evil.yaml', 'data/organisationer/evil_ab.yaml', 'data/organisationer/under/x.yaml', 'data/organisationer/README.md']) {
    const g = github({ huvud: [README, { namn, text: yaml('evil') }] });
    await kor(grund(g));
    assert.equal(sist(g.v).state, 'failure', namn);
  }
  // Att ta bort en sådan fil är däremot bara städning.
  const g = github({ bas: [README, { namn: 'data/organisationer/README.md', text: 'x' }], huvud: [README] });
  await kor(grund(g));
  assert.deepEqual([sist(g.v).state, sist(g.v).description], ['success', 'Inga organisationer ändras']);
});

test('en för stor fil gör kontrollen röd i stället för att ge en lista att bocka av', async () => {
  const g = github({ huvud: [README, org('exempel', { text: `id: exempel\n# ${'x'.repeat(300_000)}\n` })], ratt: RATT });
  await kor(grund(g));
  assert.equal(sist(g.v).state, 'failure');
  assert.match(listan(g.v).body, /för stor/);
});

test('en fil som inte går att tolka ger en lista ändå, utan krasch', async () => {
  const g = github({ huvud: [README, org('trasig', { text: 'id: [oavslutad' }), org('konstig', { text: 'id: konstig\nname:\n  value: {toString: 1}\n' })] });
  await kor(grund(g));
  assert.equal(sist(g.v).state, 'pending');
  assert.match(listan(g.v).body, /gick inte att läsa/);
});

test('granskningen tolkar filen som bygget gör', async () => {
  // Många alias i en fil är tillåtet i bygget. Granskaren ska då se innehållet, inte ett fel.
  const text = `id: alias\nname:\n  value: Aliasbolaget\nd: &d 2026-10-07\n${Array.from({ length: 70 }, (_, i) => `f${i}: *d`).join('\n')}\n`;
  const g = github({ huvud: [README, org('alias', { text })] });
  await kor(grund(g));
  assert.match(listan(g.v).body, /Namn enligt filen: `Aliasbolaget`/);
});

test('ett byte av id listar både den nya posten och den som försvinner', async () => {
  // Filnamnet är id:t, och id:t står också i filen. Ett byte är därför alltid en ny fil och en borttagen.
  const g = github({ bas: [README, org('berget-ai')], huvud: [README, org('berget')] });
  await kor(grund(g));
  assert.match(sist(g.v).description, new RegExp(`0 av ${ANTAL_NY + 1}`));
  assert.match(listan(g.v).body, /`berget-ai` · tas bort/);
  assert.match(listan(g.v).body, /`berget` · ny/);
  assert.match(listan(g.v).body, /kvar under ett nytt id/);
});

test('en fil som flyttas ut ur mappen räknas som borttagen', async () => {
  const g = github({ bas: [README, org('berget-ai')], huvud: [README, { namn: 'docs/arkiv/berget-ai.yaml', text: yaml('berget-ai') }] });
  await kor(grund(g));
  assert.match(sist(g.v).description, /0 av 1/);
  assert.match(listan(g.v).body, /`berget-ai` · tas bort/);
});

test('en ändrad organisation får den korta listan, och bocken gäller just den ändringen', async () => {
  const g = github({ bas: [README, org('exempel')], huvud: [README, org('exempel', { text: yaml('exempel', 'https://ny.example') })], ratt: RATT });
  await kor(grund(g));
  assert.match(sist(g.v).description, new RegExp(`0 av ${PUNKTER.andrad.length}`));
  assert.match(listan(g.v).body, /`exempel` · ändrad/);
});

test('en pull request mot en annan gren än standardgrenen får inget läge', async () => {
  const g = github({ huvud: [README, org('exempel')], basgren: 'arende/7' });
  const ut = await kor(grund(g));
  assert.deepEqual(skrivningar(g.v), []);
  assert.match(ut.hoppad, /basgren/);
});

test('en stängd pull request lämnas i fred', async () => {
  const g = github({ huvud: [README, org('exempel')], oppen: false });
  await kor(grund(g));
  assert.deepEqual(skrivningar(g.v), []);
});

test('går ett anrop fel blir läget fel i stället för grönt, och listan rörs inte', async () => {
  for (const del of ['/git/ref/', '/issues/7/comments', 'hamta', 'slaIhop', 'commits', 'spelaUpp', 'mapp', 'rader', 'text']) {
    const g = github({ huvud: [README, org('exempel')], vid: (metod, stig) => ((del.startsWith('/') ? metod === 'GET' && stig.includes(del) : metod === 'GIT' && stig === del) ? 500 : null) });
    await assert.rejects(kor(grund(g)), /500/, del);
    assert.equal(listan(g.v), undefined, del);
    assert.deepEqual([sist(g.v).state, sist(g.v).context], ['error', KONTEXT], del);
    assert.ok(sist(g.v).description.length <= 140);
  }
});

test('går rätten inte att slå upp räknas intyget inte, och läget blir fel', async () => {
  const g = await avbockad({ vid: (metod, stig) => (stig.includes('/collaborators/') ? 502 : null) });
  const kropp = listan(g.v).body;
  g.v.kommentera('granskare', '/granskad');
  await assert.rejects(kor(grund(g)), /502/);
  assert.equal(listan(g.v).body, kropp);
  assert.equal(sist(g.v).state, 'error');
});

test('en commit som inte finns i förrådet stoppar kontrollen', async () => {
  const g = github({ huvud: [README, org('exempel')] });
  g.v.huvud = 'f'.repeat(40);
  await assert.rejects(kor(grund(g)));
  assert.deepEqual([sist(g.v).state, sist(g.v).sha], ['error', 'f'.repeat(40)]);
});

test('tusentals kommentarer stoppar inte kontrollen, och ett intyg långt ner hittas', async () => {
  const g = await avbockad();
  for (let i = 0; i < 1200; i++) g.v.kommentera('nagon', 'brus');
  g.v.kommentera('granskare', '/granskad');
  await kor(grund(g));
  assert.equal(sist(g.v).state, 'success');
});

test('en kommentar som bara ser ut som listan räknas inte', async () => {
  const g = github({ huvud: [README, org('exempel')], kommentarer: [{ login: 'nagon', body: `${MARKOR}\n- [x] allt klart` }], ratt: RATT });
  await kor(grund(g));
  assert.equal(sist(g.v).state, 'pending');
  assert.equal(g.v.kommentarer.length, 2);
});

test('rader som någon har tagit bort ur listan kommer tillbaka, och intyget slutar gälla', async () => {
  const g = await avbockad();
  g.v.kommentera('granskare', '/granskad');
  // En app med skrivrätt tar bort fyra punkter ur listan efter intyget.
  g.v.redigera(listan(g.v), (b) => b.split('\n').filter((r) => !/:(k2|k3|kalla|pu) -->/.test(r)).join('\n'));
  await kor(grund(g));
  assert.equal(listan(g.v).body.split('\n').filter((r) => /^- \[[ x]\] /.test(r)).length, ANTAL_NY);
  assert.equal(sist(g.v).state, 'pending');
});

test('en pull request utan organisationer blir grön utan lista', async () => {
  const g = github({ bas: [README, { namn: 'src/pages/om.astro', text: 'a' }], huvud: [README, { namn: 'src/pages/om.astro', text: 'b' }] });
  await kor(grund(g));
  assert.deepEqual([sist(g.v).state, sist(g.v).description], ['success', 'Inga organisationer ändras']);
  assert.equal(listan(g.v), undefined);
});

test('ändras regelfiler står det i läget, med och utan organisationer', async () => {
  const bara = github({ bas: [README, { namn: 'kriterier.md', text: 'a' }], huvud: [README, { namn: 'kriterier.md', text: 'b' }] });
  await kor(grund(bara));
  assert.equal(sist(bara.v).state, 'success');
  assert.match(sist(bara.v).description, /Regelfiler ändras/);
  const bada = github({ bas: [README, { namn: 'scripts/validera.mjs', text: 'a' }], huvud: [README, { namn: 'scripts/validera.mjs', text: 'b' }, org('exempel')] });
  await kor(grund(bada));
  assert.match(sist(bada.v).description, /Regelfiler ändras också/);
  assert.match(listan(bada.v).body, /ändrar också regelfiler/);
});

test('en lista som redan stämmer kostar inga filhämtningar', async () => {
  const g = await avbockad();
  const fore = g.v.anrop.length;
  await kor(grund(g));
  const nya = g.v.anrop.slice(fore);
  assert.equal(nya.filter((a) => a === 'GIT text').length, 0);
  assert.equal(nya.filter((a) => a.startsWith('PATCH')).length, 0);
  // Pull requesten, mains spets, kommentarerna, mains spets en gång till och commitens läge.
  // Inget som växer med antalet filer, och inget skrivs när ingenting har ändrats.
  assert.deepEqual(nya.filter((a) => !a.startsWith('GIT ')).map((a) => a.split(' ')[0]), ['GET', 'GET', 'GET', 'GET', 'GET']);
});

test('en torrkörning skriver ingenting', async () => {
  const g = github({ huvud: [README, org('exempel')] });
  const ut = await kor(grund(g, { torrt: true }));
  assert.deepEqual(skrivningar(g.v), []);
  assert.equal(ut.resultat.state, 'pending');
  assert.ok(ut.kommentar.startsWith(MARKOR));
});

test('skillnaden mellan två träd bryr sig om innehåll, filtyp och namn, inte om ordning', () => {
  const t = (path, sha, mode = '100644', size = 10) => ({ path, mode, type: 'blob', sha, size });
  const bas = [t('a.txt', 'a1'), t('data/organisationer/kvar.yaml', 'k1'), t('data/organisationer/bort.yaml', 'b1'), t('data/organisationer/andrad.yaml', 'x1')];
  const huvud = [t('data/organisationer/ny.yaml', 'n1'), t('data/organisationer/andrad.yaml', 'x2'), t('data/organisationer/kvar.yaml', 'k1'), t('a.txt', 'a1')];
  const ut = jamforTrad(bas, huvud);
  assert.deepEqual(ut.filer.map((f) => [f.sokvag.split('/').pop(), f.status]), [['andrad.yaml', 'modified'], ['bort.yaml', 'removed'], ['ny.yaml', 'added']]);
  assert.deepEqual([ut.ogiltiga, ut.regelfiler], [[], false]);
  assert.ok(ut.filer.every((f) => /^[0-9a-f]{64}$/.test(f.version)));
  // Samma fil som körbar är en annan fil, och en ändrad fil får en annan version om den ändras från något annat.
  assert.equal(jamforTrad([t('data/organisationer/a.yaml', 's', '100644')], [t('data/organisationer/a.yaml', 's', '100755')]).filer.length, 1);
  const v1 = jamforTrad([t('data/organisationer/a.yaml', 'gammal1')], [t('data/organisationer/a.yaml', 'ny')]).filer[0].version;
  const v2 = jamforTrad([t('data/organisationer/a.yaml', 'gammal2')], [t('data/organisationer/a.yaml', 'ny')]).filer[0].version;
  assert.notEqual(v1, v2);
  // Det tredje trädet är grenens eget. Skiljer sig filen där från den sammanslagna har main ändrat i den.
  assert.equal(jamforTrad([], [t('data/organisationer/a.yaml', 'ihop')], [t('data/organisationer/a.yaml', 'ihop')]).filer[0].blandad, false);
  assert.equal(jamforTrad([], [t('data/organisationer/a.yaml', 'ihop')], [t('data/organisationer/a.yaml', 'grenens')]).filer[0].blandad, true);
});

test('när anropsbudgeten är slut väntar körningen, om det går över inom rimlig tid', () => {
  const nu = Date.parse('2026-10-07T12:00:00Z');
  const om = (s) => String(Math.round(nu / 1000) + s);
  assert.equal(vantetid(403, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': om(120) }, nu), 121_000);
  assert.equal(vantetid(429, { 'retry-after': '30' }, nu), 30_000);
  // Ett vanligt nej är inget att vänta på, och inte heller en väntan på en timme.
  assert.equal(vantetid(403, { 'x-ratelimit-remaining': '57' }, nu), null);
  assert.equal(vantetid(403, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': om(3600) }, nu), null);
  assert.equal(vantetid(404, { 'retry-after': '30' }, nu), null);
  assert.equal(vantetid(500, {}, nu), null);
  // Svarets huvuden kan komma som ett Headers-objekt.
  assert.equal(vantetid(429, new Headers({ 'retry-after': '5' }), nu), 5000);
});

test('en app som skriver i en människas namn intygar inte', async () => {
  // En AI-agent kan vara kopplad till en människas konto och skriva kommentarer i hennes namn.
  // GitHub märker ut sådana kommentarer, och de räknas inte.
  const g = await avbockad();
  g.v.kommentera('granskare', '/granskad', { viaApp: { slug: 'hjalpsam-agent', name: 'Hjälpsam agent' } });
  await kor(grund(g));
  assert.equal(sist(g.v).state, 'pending');
  g.v.kommentera('granskare', '/granskad');
  await kor(grund(g));
  assert.equal(sist(g.v).state, 'success');
});

test('"/granskad inte än" intygar ingenting', async () => {
  const g = await avbockad();
  g.v.kommentera('granskare', '/granskad inte än, väntar på svar om belägget');
  await kor(grund(g));
  assert.equal(sist(g.v).state, 'pending');
});

test('det någon bockar ur medan körningen arbetar skrivs inte över', async () => {
  // Körningen läser listan, räknar, och skriver om den. Bockar granskaren ur en punkt däremellan
  // får den inte komma tillbaka ikryssad.
  const g = await avbockad();
  g.v.push([README, org('exempel'), { namn: 'kriterier.md', text: 'nya kriterier' }]);
  let gjort = false;
  const vid = (metod, stig, v) => {
    // Precis före skrivningen läser körningen kommentaren en gång till. Då har granskaren hunnit bocka ur.
    if (!gjort && metod === 'GET' && /\/issues\/comments\/\d+$/.test(stig)) {
      gjort = true;
      v.redigera(listan(v), (b) => b.replace('- [x] ', '- [ ] '));
    }
    return null;
  };
  await kor(grund({ ...g, api: (m, s, k) => (vid(m, s.split('?')[0], g.v), g.api(m, s, k)) }));
  assert.equal(gjort, true);
  assert.equal(listan(g.v).body.split('\n').filter((r) => r.startsWith('- [x] ')).length, ANTAL_NY - 1);
  assert.match(sist(g.v).description, new RegExp(`${ANTAL_NY - 1} av ${ANTAL_NY}`));
});

test('main räknas från sin senaste commit, inte från den pull requesten öppnades mot', async () => {
  // En annan pull request har lagt in en organisation i main. Den här grenen tar in main och tar
  // sedan bort organisationen igen. Mot commiten den öppnades mot syns ingenting, men slås den
  // ihop försvinner organisationen.
  const g = github();
  g.v.main([README, org('nyterio')]);
  g.v.push([README, org('nyterio')], [g.v.huvud, g.v.bas]);
  g.v.push([README]);
  await kor(grund(g));
  assert.equal(sist(g.v).state, 'pending');
  assert.match(listan(g.v).body, /`nyterio` · tas bort/);
});

test('det som main redan har och grenen inte ändrar är ingen ändring', async () => {
  // Grenen bygger på en äldre main och rör inte organisationen alls. Slås den ihop står den kvar.
  const g = github();
  g.v.main([README, org('nyterio')]);
  g.v.push([{ namn: 'README.md', text: 'rättad' }]);
  await kor(grund(g));
  assert.deepEqual([sist(g.v).state, sist(g.v).description], ['success', 'Inga organisationer ändras']);
  assert.equal(listan(g.v), undefined);
});

test('commits som tar ut varandra bara när de slås ihop tillsammans stoppas', async () => {
  // Main har tagit bort en organisation. Grenen bygger på en äldre main: första commiten tar
  // också bort den, andra lägger tillbaka den. Tillsammans ändrar de ingenting, så en vanlig
  // sammanslagning lämnar organisationen borttagen. Men Rebase and merge spelar upp dem en och
  // en: den första gör då ingenting, och den andra lägger tillbaka organisationen i main.
  const g = github({ bas: [README, org('borttagen')], huvud: [README] });
  g.v.push([{ namn: 'README.md', text: 'rättad' }, org('borttagen')]);
  g.v.main([README]);
  await kor(grund(g));
  assert.equal(sist(g.v).state, 'failure');
  assert.match(sist(g.v).description, /en och en/);
  assert.ok(sist(g.v).description.length <= 140);
  assert.equal(listan(g.v), undefined);
});

test('samma sak åt andra hållet: en organisation som main just har fått kan inte tas bort osedd', async () => {
  const g = github();
  g.v.main([README, org('nyterio')]);
  g.v.push([README, org('nyterio')]);
  g.v.push([README]);
  await kor(grund(g));
  assert.equal(sist(g.v).state, 'failure');
  assert.match(sist(g.v).description, /en och en/);
});

test('visar listan ett innehåll och uppspelade commits ger ett annat blir läget rött', async () => {
  // Main har ändrat en rad. Grenen gör samma ändring, och ändrar sedan tillbaka och lägger till
  // en rad. Sammanslaget står mains ändring kvar. Uppspelat en och en gör den inte det.
  const post = (status, extra = '') => `id: exempel\nname:\n  value: Exempel AB\nstatus: ${status}\nrad1: a\nrad2: b\nrad3: c\nrad4: d\nwebsite: https://exempel.se\n${extra}`;
  const g = github({ bas: [README, org('exempel', { text: post('claimed') })], huvud: [README, org('exempel', { text: post('unknown') })] });
  g.v.push([README, org('exempel', { text: post('claimed', 'ny: rad\n') })]);
  g.v.main([README, org('exempel', { text: post('unknown') })]);
  await kor(grund(g));
  assert.equal(sist(g.v).state, 'failure');
  assert.match(sist(g.v).description, /en och en/);
});

test('en gren med många vanliga commits granskas som vanligt', async () => {
  const g = github({ huvud: [README, org('exempel')] });
  g.v.push([README, org('exempel', { text: yaml('exempel', 'https://ny.example') })]);
  g.v.main([README, { namn: 'docs/a.md', text: 'a' }]);
  g.v.push([{ namn: 'README.md', text: 'rättad' }, org('exempel', { text: yaml('exempel', 'https://ny.example') })]);
  await kor(grund(g));
  assert.equal(sist(g.v).state, 'pending');
  assert.match(listan(g.v).body, /`exempel` · ny/);
  assert.match(listan(g.v).body, /ny\.example/);
});

test('en commit i main som inte rör organisationen ändrar varken bockar eller intyg', async () => {
  const g = await avbockad();
  g.v.kommentera('granskare', '/granskad');
  await kor(grund(g));
  assert.equal(sist(g.v).state, 'success');
  const kropp = listan(g.v).body;
  const fore = skrivningar(g.v).length;
  g.v.main([{ namn: 'README.md', text: 'en annan pull request har slagits ihop' }]);
  await kor(grund(g));
  assert.equal(sist(g.v).state, 'success');
  assert.equal(listan(g.v).body, kropp);
  assert.deepEqual(skrivningar(g.v).slice(fore), []);
});

test('ändrar main samma organisation efter intyget visas det sammanslagna, och intyget gäller inte', async () => {
  const post = (namn, webb) => `id: exempel\nname:\n  value: ${namn}\ntype:\n  value: bolag\nrad1: a\nrad2: b\nrad3: c\nrad4: d\nrad5: e\nwebsite: ${webb}\n`;
  const g = github({ bas: [README, org('exempel', { text: post('Exempel AB', 'https://exempel.se') })], huvud: [README, org('exempel', { text: post('Nytt namn AB', 'https://exempel.se') })], ratt: RATT });
  await kor(grund(g));
  bocka(g.v);
  g.v.kommentera('granskare', '/granskad');
  await kor(grund(g));
  assert.equal(sist(g.v).state, 'success');
  // Main ändrar webbplatsen i samma fil. Git slår ihop de två ändringarna utan konflikt, och
  // filen som går in är då en som ingen har sett.
  g.v.main([README, org('exempel', { text: post('Exempel AB', 'https://annan.example') })]);
  await kor(grund(g));
  assert.equal(sist(g.v).state, 'pending');
  assert.match(sist(g.v).description, new RegExp(`0 av ${PUNKTER.andrad.length}`));
  assert.match(listan(g.v).body, /Nytt namn AB/);
  assert.match(listan(g.v).body, /annan\.example/);
  assert.match(listan(g.v).body, /efter sammanslagningen med main/);
});

test('en konflikt mot main gör kontrollen röd tills den är löst', async () => {
  const g = github({ bas: [README, org('exempel')], huvud: [README, org('exempel', { text: yaml('exempel', 'https://ny.example') })] });
  await kor(grund(g));
  const kropp = listan(g.v).body;
  g.v.main([README, org('exempel', { text: yaml('exempel', 'https://tredje.example') })]);
  await kor(grund(g));
  assert.equal(sist(g.v).state, 'failure');
  assert.match(sist(g.v).description, /konflikt/);
  assert.ok(sist(g.v).description.length <= 140);
  assert.equal(listan(g.v).body, kropp);
});

test('flyttas main medan körningen arbetar räknas allt om', async () => {
  let flyttad = false;
  const g = github({
    bas: [README, org('exempel')],
    huvud: [README, org('exempel', { text: yaml('exempel', 'https://ny.example') })],
    vid: (metod, stig, v) => {
      // Main får en commit som krockar, efter att sammanslagningen är uträknad men före skrivningen.
      if (!flyttad && stig.includes('/issues/7/comments')) {
        flyttad = true;
        v.main([README, org('exempel', { text: yaml('exempel', 'https://tredje.example') })]);
      }
      return null;
    },
  });
  await kor(grund(g));
  assert.equal(flyttad, true);
  assert.equal(g.v.statusar.length, 1);
  assert.equal(sist(g.v).state, 'failure');
  assert.equal(listan(g.v), undefined);
});

test('försvinner konflikten medan körningen arbetar blir läget inte rött', async () => {
  // Main krockar med grenen när körningen börjar, men har flyttat sig igen innan läget skrivs.
  // Ett rött läge för en main som inte längre finns ska inte bli stående.
  const andrad = org('exempel', { text: yaml('exempel', 'https://ny.example') });
  let flyttad = false;
  const g = github({
    bas: [README, org('exempel')],
    huvud: [README, andrad],
    vid: (metod, stig, v) => {
      if (!flyttad && metod === 'GIT' && stig === 'slaIhop') {
        flyttad = true;
        v.main([README, andrad]);
      }
      return null;
    },
  });
  g.v.main([README, org('exempel', { text: yaml('exempel', 'https://tredje.example') })]);
  await kor(grund(g));
  assert.equal(flyttad, true);
  assert.equal(g.v.statusar.length, 1);
  // Main har nu samma ändring som grenen. Då finns inget kvar att granska.
  assert.deepEqual([sist(g.v).state, sist(g.v).description], ['success', 'Inga organisationer ändras']);
});

test('en gren som slår ihop två commits som redan finns i main kan inte smyga bort en organisation', async () => {
  // Main innehåller en sammanslagning av två sidogrenar. Grenen här gör om samma sammanslagning
  // för hand och tappar organisationen på vägen. Då finns två commits som grenen och main har
  // gemensamt, och en jämförelse mot bara den ena visar ingenting.
  const annan = { namn: 'README.md', text: 'ny text' };
  const g = github();
  const a = g.v.commit([README, org('nyterio')], [g.v.bas]);
  const b = g.v.commit([annan], [g.v.bas]);
  g.v.main([annan, org('nyterio')], [a, b]);
  g.v.push([annan], [b, a]);
  await kor(grund(g));
  assert.equal(sist(g.v).state, 'failure');
  assert.match(sist(g.v).description, /en och en/);
});

test('en sammanslagning som ändrar organisationer för hand stoppas', async () => {
  // Grenens första commit lägger till en organisation. Sedan tas main in, och i den
  // sammanslagningen tas organisationen bort för hand. Slutresultatet ser tomt ut, men den som
  // slår ihop med Rebase and merge får med den första commiten och inte sammanslagningen.
  const dok = { namn: 'docs/a.md', text: 'a' };
  const g = github({ huvud: [README, org('smyg')] });
  g.v.main([README, dok]);
  g.v.push([README, dok], [g.v.huvud, g.v.bas]);
  await kor(grund(g));
  assert.equal(sist(g.v).state, 'failure');
  assert.match(sist(g.v).description, /en och en/);
  assert.ok(sist(g.v).description.length <= 140);
});

test('en gren som har tagit in main på vanligt sätt granskas som vanligt', async () => {
  const dok = { namn: 'docs/a.md', text: 'a' };
  const g = github({ huvud: [README, org('exempel')] });
  g.v.main([README, dok]);
  g.v.push([README, org('exempel'), dok], [g.v.huvud, g.v.bas]);
  await kor(grund(g));
  assert.equal(sist(g.v).state, 'pending');
  assert.match(listan(g.v).body, /`exempel` · ny/);
});

test('byts mappen mot en länk blir kontrollen röd och säger varför', async () => {
  const g = github({ bas: [README, org('ett'), org('tva')], huvud: [README, { namn: 'data/organisationer', mode: '120000', text: '../annat' }] });
  await kor(grund(g));
  assert.equal(sist(g.v).state, 'failure');
  assert.match(sist(g.v).description, /mapp/i);
  assert.match(listan(g.v).body, /vanlig mapp/);
  assert.equal(listan(g.v).body.includes('- [ ] '), false);
});

test('git läser trädet som det är, även med ovanliga filnamn', async () => {
  const f = forrad();
  const c = f.commit([README, { namn: 'data/organisationer/med mellanslag\noch ny rad.yaml', text: 'x' }, { namn: 'data/organisationer/länk.yaml', mode: '120000', text: '../x' }, org('vanlig')]);
  const rader = await f.git.rader(c);
  assert.deepEqual(rader.map((r) => [r.path, r.mode, r.type]), [
    ['README.md', '100644', 'blob'],
    ['data/organisationer/länk.yaml', '120000', 'blob'],
    ['data/organisationer/med mellanslag\noch ny rad.yaml', '100644', 'blob'],
    ['data/organisationer/vanlig.yaml', '100644', 'blob'],
  ]);
  assert.equal(rader.at(-1).size, Buffer.byteLength(yaml('vanlig')));
  assert.equal(await f.git.text(rader.at(-1).sha), yaml('vanlig'));
  assert.match(await f.git.mapp(c, 'data/organisationer'), /^[0-9a-f]{40}$/);
  assert.equal(await f.git.mapp(c, 'data/saknas'), null);
  // Det som inte är ett id släpps aldrig fram till git.
  await assert.rejects(f.git.rader('--help'));
  await assert.rejects(f.git.slaIhop(c, 'main'));
});
