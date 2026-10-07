// Tester för körningen som skriver granskningslistan och sätter kontrollens läge.
// GitHub är utbytt mot ett låtsas-GitHub i minnet, så inget anrop lämnar datorn.
//   npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { kor, jamforTrad, vantetid, arOvidkommande, ApiFel } from './lib/granskningskorning.mjs';
import { MARKOR, KONTEXT, PUNKTER } from './lib/granskning.mjs';

const REPO = 'opensverige/ai-kartan';
const ANTAL_NY = PUNKTER.ny.length;
const BAS = '0'.repeat(40);
const C1 = '1'.repeat(40);
const C2 = '2'.repeat(40);
const blobSha = (text) => createHash('sha1').update(`blob ${Buffer.byteLength(text)}\0${text}`).digest('hex');
const yaml = (id, webb = 'https://exempel.se') => `id: ${id}\nname:\n  value: Exempel AB\ntype:\n  value: bolag\nwebsite: ${webb}\n`;
const org = (id, extra = {}) => ({ namn: `data/organisationer/${id}.yaml`, text: yaml(id), ...extra });
const BOT = { login: 'github-actions[bot]', type: 'Bot' };
const README = { namn: 'README.md', text: 'hej' };

/**
 * Ett låtsas-GitHub. Varje commit är hela sitt träd: en lista med { namn, text, mode, storlek }.
 * `bas` är trädet där pull requesten grenade av och `huvud` trädet i dess senaste commit.
 * `vid(metod, stig, v)` körs före varje anrop och får ändra läget eller returnera en statuskod att svara med.
 */
function github({ bas = [README], huvud = [README], basgren = 'main', oppen = true, kommentarer = [], ratt = {}, vid = () => null, stympat = false } = {}) {
  let klocka = Date.parse('2026-10-07T12:00:00Z');
  const v = {
    huvud: C1,
    commits: { [BAS]: bas, [C1]: huvud },
    kommentarer: [],
    statusar: [],
    anrop: [],
    nastaId: 5000,
    /** Tiden går en sekund för varje sak som händer, så att ordningen alltid går att läsa av. */
    nu() {
      klocka += 1000;
      return new Date(klocka).toISOString().replace('.000Z', 'Z');
    },
    /** En ny commit på pull requestens gren. */
    push(sha, filer) {
      v.commits[sha] = filer;
      v.huvud = sha;
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
  for (const k of kommentarer) v.kommentera(k.login, k.body, k);
  const rad = (a) => ({ path: a.namn, mode: a.mode ?? '100644', type: a.typ ?? 'blob', sha: a.sha ?? blobSha(a.text ?? ''), size: a.storlek ?? Buffer.byteLength(a.text ?? '') });
  const api = async (metod, stig, kropp) => {
    const [rent, fraga = ''] = stig.split('?');
    const kod = vid(metod, rent, v);
    v.anrop.push(`${metod} ${rent}`);
    if (kod) throw new ApiFel(metod, stig, kod);
    const sida = Number(new URLSearchParams(fraga).get('page') ?? 1);
    let m;
    if (metod === 'GET' && /\/pulls\/\d+$/.test(rent)) return { state: oppen ? 'open' : 'closed', html_url: 'https://github.com/x/pull/7', head: { sha: v.huvud }, base: { ref: basgren, sha: BAS, repo: { default_branch: 'main' } } };
    if (metod === 'GET' && (m = rent.match(/\/compare\/([0-9a-f]{40})\.\.\.([0-9a-f]{40})$/))) return { merge_base_commit: { sha: m[1] }, files: [] };
    if (metod === 'GET' && (m = rent.match(/\/git\/trees\/([0-9a-f]{40})$/))) return { truncated: stympat, tree: (v.commits[m[1]] ?? []).map(rad) };
    if (metod === 'GET' && (m = rent.match(/\/git\/blobs\/([0-9a-f]{40})$/))) {
      const a = Object.values(v.commits).flat().find((x) => rad(x).sha === m[1]);
      if (!a) throw new ApiFel(metod, stig, 404);
      return { encoding: 'base64', size: Buffer.byteLength(a.text ?? ''), content: Buffer.from(a.text ?? '').toString('base64') };
    }
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
  return { api, v };
}

const grund = (g, extra = {}) => ({ api: g.api, repo: REPO, nummer: 7, logg: () => {}, ...extra });
const listan = (v) => v.kommentarer.find((k) => k.user?.login === BOT.login && String(k.body).startsWith(MARKOR));
const lagen = (v) => v.anrop.filter((a) => a.startsWith('POST') && a.includes('/statuses/')).length;
const sist = (v) => v.statusar.at(-1);
const skrivningar = (v) => v.anrop.filter((a) => !a.startsWith('GET '));
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
  assert.deepEqual([sist(g.v).state, sist(g.v).context, sist(g.v).sha], ['pending', KONTEXT, C1]);
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
  assert.deepEqual(skrivningar(g.v).slice(fore), [`POST /repos/${REPO}/statuses/${C1}`]);
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
  assert.match(sist(g.v).description, /ändrats efter intyget/);
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
  g.v.push(C2, [README, org('exempel', { text: yaml('exempel', 'https://annan.example') })]);
  await kor(grund(g));
  assert.deepEqual([sist(g.v).state, sist(g.v).sha], ['pending', C2]);
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
  g.v.push(C2, [{ namn: 'README.md', text: 'ändrad' }, org('exempel')]);
  await kor(grund(g));
  assert.deepEqual([sist(g.v).state, sist(g.v).sha], ['success', C2]);
  assert.equal(listan(g.v).body, kropp);
});

test('skrivs listan om gäller inget äldre intyg, redan i samma körning', async () => {
  const g = await avbockad();
  g.v.kommentera('granskare', '/granskad');
  await kor(grund(g));
  assert.equal(sist(g.v).state, 'success');
  // En ny commit ändrar en regelfil. Organisationens fil är orörd, så bockarna står kvar, men
  // listan får en ny rad och är alltså inte längre den som intygades.
  g.v.push(C2, [README, org('exempel'), { namn: 'kriterier.md', text: 'nya kriterier' }]);
  await kor(grund(g));
  assert.match(listan(g.v).body, /ändrar också regelfiler/);
  assert.equal(listan(g.v).body.split('\n').filter((r) => r.startsWith('- [x] ')).length, ANTAL_NY);
  assert.deepEqual([sist(g.v).state, sist(g.v).sha], ['pending', C2]);
  assert.match(sist(g.v).description, /ändrats efter intyget/);
  // Samma svar nästa gång: läget får inte växla mellan två körningar utan att något har hänt.
  await kor(grund(g));
  assert.equal(sist(g.v).state, 'pending');
});

test('läget gäller alltid den commit som lästes, även om pull requesten flyttas under körningen', async () => {
  // Trädet för en commit kan inte ändras. En ny commit mitt i körningen får därför inte kunna
  // ge grönt åt den gamla: den gamla har fortfarande en organisation i sig.
  for (const nar of ['/compare/', '/git/trees/', '/issues/7/comments']) {
    let flyttad = false;
    const g = github({
      huvud: [README, org('smyg')],
      vid: (metod, stig, v) => {
        if (!flyttad && stig.includes(nar)) {
          flyttad = true;
          v.push(C2, [README]);
        }
        return null;
      },
    });
    await kor(grund(g));
    assert.deepEqual([sist(g.v).state, sist(g.v).sha], ['pending', C1], nar);
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
  const g = github({ huvud: [README, org('exempel', { storlek: 300_000 })], ratt: RATT });
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

test('ett namnbyte listar både den nya posten och det gamla id:t', async () => {
  const g = github({ bas: [README, org('berget-ai')], huvud: [README, { namn: 'data/organisationer/nytt-namn.yaml', text: yaml('berget-ai') }] });
  await kor(grund(g));
  assert.match(sist(g.v).description, new RegExp(`0 av ${ANTAL_NY + 1}`));
  assert.match(listan(g.v).body, /`berget-ai` · ersätts av `nytt-namn`/);
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
  for (const del of ['/compare/', '/git/trees/', '/git/blobs/', '/issues/7/comments']) {
    const g = github({ huvud: [README, org('exempel')], vid: (metod, stig) => (metod === 'GET' && stig.includes(del) ? 500 : null) });
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

test('ett träd som GitHub har kapat stoppar kontrollen', async () => {
  const g = github({ huvud: [README, org('exempel')], stympat: true });
  await assert.rejects(kor(grund(g)));
  assert.equal(sist(g.v).state, 'error');
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
  assert.equal(nya.filter((a) => a.includes('/git/blobs/')).length, 0);
  assert.equal(nya.filter((a) => a.startsWith('PATCH')).length, 0);
  // Pull requesten, jämförelsen, två träd, kommentarerna och commitens läge. Inget som växer med
  // antalet filer, och inget skrivs när ingenting har ändrats.
  assert.deepEqual(nya.map((a) => a.split(' ')[0]), ['GET', 'GET', 'GET', 'GET', 'GET', 'GET']);
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
  const bas = [t('a.txt', 'a1'), t('data/organisationer/kvar.yaml', 'k1'), t('data/organisationer/bort.yaml', 'b1'), t('data/organisationer/andrad.yaml', 'x1'), { path: 'data', mode: '040000', type: 'tree', sha: 't1' }];
  const huvud = [t('data/organisationer/ny.yaml', 'n1'), t('data/organisationer/andrad.yaml', 'x2'), t('data/organisationer/kvar.yaml', 'k1'), t('a.txt', 'a1'), { path: 'data', mode: '040000', type: 'tree', sha: 't2' }];
  const ut = jamforTrad(bas, huvud);
  assert.deepEqual(ut.filer.map((f) => [f.sokvag.split('/').pop(), f.status]), [['andrad.yaml', 'modified'], ['bort.yaml', 'removed'], ['ny.yaml', 'added']]);
  assert.deepEqual([ut.ogiltiga, ut.regelfiler], [[], false]);
  assert.ok(ut.filer.every((f) => /^[0-9a-f]{64}$/.test(f.version)));
  // Samma fil som körbar är en annan fil, och en ändrad fil får en annan version om den ändras från något annat.
  assert.equal(jamforTrad([t('data/organisationer/a.yaml', 's', '100644')], [t('data/organisationer/a.yaml', 's', '100755')]).filer.length, 1);
  const v1 = jamforTrad([t('data/organisationer/a.yaml', 'gammal1')], [t('data/organisationer/a.yaml', 'ny')]).filer[0].version;
  const v2 = jamforTrad([t('data/organisationer/a.yaml', 'gammal2')], [t('data/organisationer/a.yaml', 'ny')]).filer[0].version;
  assert.notEqual(v1, v2);
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
  g.v.push(C2, [README, org('exempel'), { namn: 'kriterier.md', text: 'nya kriterier' }]);
  let gjort = false;
  const vid = (metod, stig, v) => {
    // Precis före skrivningen läser körningen kommentaren en gång till. Då har granskaren hunnit bocka ur.
    if (!gjort && metod === 'GET' && /\/issues\/comments\/\d+$/.test(stig)) {
      gjort = true;
      v.redigera(listan(v), (b) => b.replace('- [x] ', '- [ ] '));
    }
    return null;
  };
  await kor(grund({ api: (m, s, k) => (vid(m, s.split('?')[0], g.v), g.api(m, s, k)), v: g.v }));
  assert.equal(gjort, true);
  assert.equal(listan(g.v).body.split('\n').filter((r) => r.startsWith('- [x] ')).length, ANTAL_NY - 1);
  assert.match(sist(g.v).description, new RegExp(`${ANTAL_NY - 1} av ${ANTAL_NY}`));
});

test('en ny kommentar från någon utan skrivrätt behöver ingen körning', async () => {
  const g = github({ ratt: { granskare: 'write', lasare: 'read' } });
  const ny = (login, type = 'User') => ({ handelse: 'issue_comment', atgard: 'created', kommentar: { user: { login, type } } });
  assert.equal(await arOvidkommande({ api: g.api, repo: REPO, ...ny('lasare') }), true);
  assert.equal(await arOvidkommande({ api: g.api, repo: REPO, ...ny('okand') }), true);
  assert.equal(await arOvidkommande({ api: g.api, repo: REPO, ...ny('hjalpsam[bot]', 'Bot') }), true);
  // Den som får intyga, flödets egen kommentar, och allt som ändrar eller tar bort något, ska alltid köras.
  assert.equal(await arOvidkommande({ api: g.api, repo: REPO, ...ny('granskare') }), false);
  assert.equal(await arOvidkommande({ api: g.api, repo: REPO, ...ny(BOT.login, 'Bot') }), false);
  assert.equal(await arOvidkommande({ api: g.api, repo: REPO, handelse: 'issue_comment', atgard: 'edited', kommentar: { user: { login: 'lasare', type: 'User' } } }), false);
  assert.equal(await arOvidkommande({ api: g.api, repo: REPO, handelse: 'issue_comment', atgard: 'deleted', kommentar: { user: { login: 'lasare', type: 'User' } } }), false);
  assert.equal(await arOvidkommande({ api: g.api, repo: REPO, handelse: 'pull_request_target', atgard: 'synchronize' }), false);
  assert.equal(await arOvidkommande({ api: g.api, repo: REPO, handelse: 'workflow_dispatch' }), false);
});
