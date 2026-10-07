// Tester för körningen som skriver granskningslistan och sätter kontrollens läge.
// GitHub är utbytt mot ett låtsas-GitHub i minnet, så inget anrop lämnar datorn.
//   npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { kor, ApiFel } from './lib/granskningskorning.mjs';
import { MARKOR, KONTEXT, PUNKTER } from './lib/granskning.mjs';

const REPO = 'opensverige/ai-kartan';
const ANTAL_NY = PUNKTER.ny.length;
const blobSha = (text) => createHash('sha1').update(`blob ${Buffer.byteLength(text)}\0${text}`).digest('hex');
const yaml = (id, webb = 'https://exempel.se') => `id: ${id}\nname:\n  value: Exempel AB\ntype:\n  value: bolag\nwebsite: ${webb}\n`;
const org = (id, extra = {}) => ({ namn: `data/organisationer/${id}.yaml`, text: yaml(id), ...extra });
const shaFor = (a) => a.sha ?? blobSha(a.text ?? '');
const BOT = { login: 'github-actions[bot]', type: 'Bot' };

/**
 * Ett låtsas-GitHub. `andringar` är pull requestens filer: { namn, text, status, mode, fore, sha }.
 * `vid(metod, stig, v)` körs före varje anrop och får ändra läget eller returnera en statuskod att svara med.
 */
function github({ andringar = [], base = 'main', oppen = true, kommentarer = [], ratt = {}, vid = () => null, huvud = '1'.repeat(40), antalFiler = null } = {}) {
  const v = {
    huvud,
    commits: { [huvud]: andringar },
    kommentarer: kommentarer.map((k, i) => ({ id: i + 1, html_url: `https://github.com/x/pull/7#issuecomment-${i + 1}`, ...k })),
    statusar: [],
    anrop: [],
    nastaId: 5000,
    /** En ny commit på pull requestens gren. */
    push(sha, filer) {
      v.commits[sha] = filer;
      v.huvud = sha;
    },
  };
  const kvar = (sha) => (v.commits[sha] ?? []).filter((a) => (a.status ?? 'added') !== 'removed');
  const api = async (metod, stig, kropp) => {
    const [rent, fraga = ''] = stig.split('?');
    const kod = vid(metod, rent, v);
    v.anrop.push(`${metod} ${rent}`);
    if (kod) throw new ApiFel(metod, stig, kod);
    const sida = Number(new URLSearchParams(fraga).get('page') ?? 1);
    const del = (lista) => lista.slice((sida - 1) * 100, sida * 100);
    let m;
    if (metod === 'GET' && /\/pulls\/\d+$/.test(rent)) return { state: oppen ? 'open' : 'closed', html_url: 'https://github.com/x/pull/7', changed_files: antalFiler ?? v.commits[v.huvud].length, head: { sha: v.huvud }, base: { ref: base, repo: { default_branch: 'main' } } };
    if (metod === 'GET' && /\/pulls\/\d+\/files$/.test(rent)) return del(v.commits[v.huvud].map((a) => ({ filename: a.namn, status: a.status ?? 'added', sha: shaFor(a), ...(a.fore ? { previous_filename: a.fore } : {}) })));
    if (metod === 'GET' && (m = rent.match(/\/git\/trees\/([0-9a-f]{40})$/))) return { truncated: false, tree: kvar(m[1]).map((a) => ({ path: a.namn, mode: a.mode ?? '100644', type: 'blob', sha: shaFor(a) })) };
    if (metod === 'GET' && (m = rent.match(/\/git\/blobs\/([0-9a-f]{40})$/))) {
      const a = Object.keys(v.commits).flatMap(kvar).find((x) => shaFor(x) === m[1]);
      if (!a) throw new ApiFel(metod, stig, 404);
      return { encoding: 'base64', size: a.storlek ?? Buffer.byteLength(a.text ?? ''), content: Buffer.from(a.text ?? '').toString('base64') };
    }
    if (metod === 'GET' && /\/issues\/\d+\/comments$/.test(rent)) return del(v.kommentarer);
    if (metod === 'GET' && (m = rent.match(/\/collaborators\/([^/]+)\/permission$/))) {
      if (!ratt[m[1]]) throw new ApiFel(metod, stig, 404);
      return { permission: ratt[m[1]], role_name: ratt[m[1]], user: { login: m[1], type: 'User' } };
    }
    if (metod === 'POST' && /\/issues\/\d+\/comments$/.test(rent)) {
      const k = { id: v.nastaId++, body: kropp.body, user: BOT, html_url: 'https://github.com/x/pull/7#issuecomment-ny' };
      v.kommentarer.push(k);
      return k;
    }
    if (metod === 'PATCH' && (m = rent.match(/\/issues\/comments\/(\d+)$/))) {
      const k = v.kommentarer.find((x) => x.id === Number(m[1]));
      k.body = kropp.body;
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

const grund = (g, extra = {}) => ({ api: g.api, repo: REPO, nummer: 7, handelse: 'pull_request_target', logg: () => {}, ...extra });
const listan = (v) => v.kommentarer.find((k) => k.user?.login === BOT.login && String(k.body).startsWith(MARKOR));
const sist = (v) => v.statusar.at(-1);
const skrivningar = (v) => v.anrop.filter((a) => !a.startsWith('GET '));
const bockad = (kropp, villkor = () => true) => kropp.split('\n').map((rad) => (rad.startsWith('- [ ] ') && villkor(rad) ? rad.replace('- [ ] ', '- [x] ') : rad)).join('\n');
/** Någon redigerar listan i webbläsaren. Returnerar det som händelsen bär med sig. */
function redigera(v, andra) {
  const k = listan(v);
  const fore = k.body;
  k.body = andra(fore);
  return { kommentarId: k.id, fore, efter: k.body };
}
const GRANSKARE = { login: 'granskare', type: 'User' };

test('en ny organisation får en lista och ett gult läge', async () => {
  const g = github({ andringar: [org('exempel')] });
  await kor(grund(g));
  assert.equal(listan(g.v).body.split('\n').filter((r) => r.startsWith('- [ ] ')).length, ANTAL_NY);
  assert.deepEqual([sist(g.v).state, sist(g.v).context, sist(g.v).sha], ['pending', KONTEXT, '1'.repeat(40)]);
  assert.match(sist(g.v).description, new RegExp(`0 av ${ANTAL_NY}`));
});

test('när en människa med skrivrätt har bockat av allt blir läget grönt', async () => {
  const g = github({ andringar: [org('exempel')], ratt: { granskare: 'write' } });
  await kor(grund(g));
  const redigering = redigera(g.v, (b) => bockad(b));
  const fore = skrivningar(g.v).length;
  await kor(grund(g, { handelse: 'issue_comment', avsandare: GRANSKARE, redigering }));
  assert.equal(sist(g.v).state, 'success');
  assert.match(sist(g.v).description, /granskare/);
  // Listan skrivs inte om när den redan stämmer. Annars avbryts den som bockar.
  assert.deepEqual(skrivningar(g.v).slice(fore), ['POST /repos/opensverige/ai-kartan/statuses/' + '1'.repeat(40)]);
});

test('nytt innehåll i filen nollställer bockarna, även om filversionens början är densamma', async () => {
  const g = github({ andringar: [org('exempel', { sha: 'abcdef1' + '0'.repeat(33) })], ratt: { granskare: 'write' } });
  await kor(grund(g));
  await kor(grund(g, { handelse: 'issue_comment', avsandare: GRANSKARE, redigering: redigera(g.v, (b) => bockad(b)) }));
  assert.equal(sist(g.v).state, 'success');
  // En ny commit byter innehållet. Den nya filversionen börjar på samma sju tecken.
  g.v.push('2'.repeat(40), [org('exempel', { text: yaml('exempel', 'https://annan.example'), sha: 'abcdef1' + '9'.repeat(33) })]);
  await kor(grund(g));
  assert.deepEqual([sist(g.v).state, sist(g.v).sha], ['pending', '2'.repeat(40)]);
  assert.match(sist(g.v).description, new RegExp(`0 av ${ANTAL_NY}`));
  assert.match(listan(g.v).body, /annan\.example/);
});

test('en commit som inte rör filen behåller bockarna', async () => {
  const g = github({ andringar: [org('exempel')], ratt: { granskare: 'write' } });
  await kor(grund(g));
  await kor(grund(g, { handelse: 'issue_comment', avsandare: GRANSKARE, redigering: redigera(g.v, (b) => bockad(b)) }));
  g.v.push('2'.repeat(40), [org('exempel'), { namn: 'README.md', text: 'hej', status: 'modified' }]);
  await kor(grund(g));
  assert.deepEqual([sist(g.v).state, sist(g.v).sha], ['success', '2'.repeat(40)]);
});

test('en symbolisk länk i mappen gör kontrollen röd', async () => {
  const g = github({ andringar: [org('exempel', { mode: '120000', text: 'docs/utkast/a.yaml' })] });
  await kor(grund(g));
  assert.equal(sist(g.v).state, 'failure');
  assert.match(listan(g.v).body, /inte en vanlig fil/);
  assert.equal(listan(g.v).body.includes('- [ ] '), false);
});

test('en fil med otillåtet namn i mappen gör kontrollen röd, inte grön', async () => {
  for (const namn of ['data/organisationer/Evil.yaml', 'data/organisationer/evil_ab.yaml', 'data/organisationer/under/x.yaml', 'data/organisationer/README.md']) {
    const g = github({ andringar: [{ namn, text: yaml('evil') }] });
    await kor(grund(g));
    assert.equal(sist(g.v).state, 'failure', namn);
  }
  // Att ta bort en sådan fil är däremot bara städning.
  const g = github({ andringar: [{ namn: 'data/organisationer/README.md', status: 'removed' }] });
  await kor(grund(g));
  assert.deepEqual([sist(g.v).state, sist(g.v).description], ['success', 'Inga organisationer ändras']);
});

test('bockar som en bot sätter tas bort, och en människas bockar står kvar', async () => {
  const g = github({ andringar: [org('exempel')], ratt: { granskare: 'write' } });
  await kor(grund(g));
  await kor(grund(g, { handelse: 'issue_comment', avsandare: GRANSKARE, redigering: redigera(g.v, (b) => bockad(b, (rad) => rad.includes(':k1 '))) }));
  assert.match(sist(g.v).description, new RegExp(`1 av ${ANTAL_NY}`));
  // En app med skrivrätt bockar av resten.
  const redigering = redigera(g.v, (b) => bockad(b));
  await kor(grund(g, { handelse: 'issue_comment', avsandare: { login: 'hjalpsam-agent[bot]', type: 'Bot' }, redigering }));
  assert.equal(sist(g.v).state, 'pending');
  assert.match(sist(g.v).description, new RegExp(`1 av ${ANTAL_NY}`));
  assert.equal(listan(g.v).body.split('\n').filter((r) => r.startsWith('- [x] ')).length, 1);
  // Det sägs i en egen kommentar, så att listan inte skrivs om i onödan senare.
  const not = g.v.kommentarer.at(-1);
  assert.notEqual(not.id, listan(g.v).id);
  assert.match(not.body, /räknades inte/);
  assert.match(not.body, /hjalpsam-agent/);
  // Även efter en senare commit som inte rör filen.
  g.v.push('2'.repeat(40), [org('exempel'), { namn: 'README.md', text: 'hej', status: 'modified' }]);
  await kor(grund(g));
  assert.deepEqual([sist(g.v).state, sist(g.v).sha], ['pending', '2'.repeat(40)]);
});

test('en människa utan skrivrätt räknas inte heller', async () => {
  const g = github({ andringar: [org('exempel')], ratt: { lasare: 'read' } });
  await kor(grund(g));
  for (const avsandare of [{ login: 'lasare', type: 'User' }, { login: 'okand', type: 'User' }]) {
    await kor(grund(g, { handelse: 'issue_comment', avsandare, redigering: redigera(g.v, (b) => bockad(b)) }));
    assert.equal(sist(g.v).state, 'pending', avsandare.login);
    assert.equal(listan(g.v).body.includes('- [x] '), false);
  }
});

test('går rätten inte att slå upp rörs inga bockar, och läget blir fel i stället för grönt', async () => {
  const g = github({ andringar: [org('exempel')], ratt: { granskare: 'write' }, vid: (metod, stig) => (stig.includes('/collaborators/') ? 502 : null) });
  await kor(grund(g));
  const redigering = redigera(g.v, (b) => bockad(b));
  const kropp = listan(g.v).body;
  await assert.rejects(kor(grund(g, { handelse: 'issue_comment', avsandare: GRANSKARE, redigering })), /502/);
  assert.equal(listan(g.v).body, kropp);
  assert.equal(sist(g.v).state, 'error');
  assert.ok(sist(g.v).description.length <= 140);
});

test('går en fil inte att hämta blir läget fel, och listan rörs inte', async () => {
  const g = github({ andringar: [org('exempel')], vid: (metod, stig) => (stig.includes('/git/blobs/') ? 500 : null) });
  await assert.rejects(kor(grund(g)), /500/);
  assert.equal(listan(g.v), undefined);
  assert.deepEqual([sist(g.v).state, sist(g.v).context], ['error', KONTEXT]);
});

test('tusentals kommentarer på pull requesten stoppar inte kontrollen', async () => {
  const g = github({ andringar: [org('exempel')] });
  await kor(grund(g));
  for (let i = 0; i < 1200; i++) g.v.kommentarer.push({ id: 9000 + i, body: 'brus', user: { login: 'nagon', type: 'User' } });
  await kor(grund(g));
  assert.equal(sist(g.v).state, 'pending');
  // Listan låg först, så bara första sidan behövde läsas.
  assert.equal(g.v.anrop.filter((a) => a.endsWith('/issues/7/comments') && a.startsWith('GET')).length, 2);
});

test('en kommentar som bara ser ut som listan räknas inte', async () => {
  const g = github({ andringar: [org('exempel')], kommentarer: [{ body: `${MARKOR}\n- [x] allt klart`, user: { login: 'nagon', type: 'User' } }] });
  await kor(grund(g));
  assert.equal(sist(g.v).state, 'pending');
  assert.equal(g.v.kommentarer.length, 2);
});

test('en fil som inte går att tolka ger en lista ändå, utan krasch', async () => {
  const g = github({ andringar: [org('trasig', { text: 'id: [oavslutad' }), org('konstig', { text: 'id: konstig\nname:\n  value: {toString: 1}\n' })] });
  await kor(grund(g));
  assert.equal(sist(g.v).state, 'pending');
  assert.match(listan(g.v).body, /gick inte att läsa/);
});

test('ett namnbyte listar både den nya posten och det gamla id:t', async () => {
  const g = github({ andringar: [{ namn: 'data/organisationer/nytt-namn.yaml', text: yaml('nytt-namn'), status: 'renamed', fore: 'data/organisationer/berget-ai.yaml' }] });
  await kor(grund(g));
  assert.match(sist(g.v).description, new RegExp(`0 av ${ANTAL_NY + 1}`));
  assert.match(listan(g.v).body, /`berget-ai` · ersätts av `nytt-namn`/);
});

test('en fil som flyttas ut ur mappen räknas som borttagen', async () => {
  const g = github({ andringar: [{ namn: 'docs/arkiv/berget-ai.yaml', text: yaml('berget-ai'), status: 'renamed', fore: 'data/organisationer/berget-ai.yaml' }] });
  await kor(grund(g));
  assert.match(sist(g.v).description, /0 av 1/);
  assert.match(listan(g.v).body, /`berget-ai` · tas bort/);
});

test('en pull request mot en annan gren än standardgrenen får inget läge', async () => {
  const g = github({ andringar: [{ namn: 'README.md', text: 'x' }], base: 'arende/7' });
  const ut = await kor(grund(g));
  assert.deepEqual(skrivningar(g.v), []);
  assert.match(ut.hoppad, /basgren/);
});

test('en stängd pull request lämnas i fred', async () => {
  const g = github({ andringar: [org('exempel')], oppen: false });
  await kor(grund(g));
  assert.deepEqual(skrivningar(g.v), []);
});

test('flyttas pull requestens huvud under läsningen börjar körningen om', async () => {
  let flyttad = false;
  const g = github({
    andringar: [org('exempel')],
    vid: (metod, stig, v) => {
      // Mellan första läsningen av pull requesten och fillistan kommer en ny commit med annat innehåll.
      if (!flyttad && stig.endsWith('/pulls/7/files')) {
        flyttad = true;
        v.push('2'.repeat(40), [org('exempel', { text: yaml('exempel', 'https://elak.example') })]);
      }
      return null;
    },
  });
  await kor(grund(g));
  assert.equal(sist(g.v).sha, '2'.repeat(40));
  assert.match(listan(g.v).body, /elak\.example/);
  assert.match(listan(g.v).body, new RegExp(`blob/${'2'.repeat(40)}/`));
});

test('fler filer än GitHub listar gör att kontrollen stannar i stället för att missa något', async () => {
  const g = github({ andringar: [{ namn: 'README.md', text: 'x' }], antalFiler: 3500 });
  await assert.rejects(kor(grund(g)));
  assert.equal(sist(g.v).state, 'error');
});

test('en pull request utan organisationer blir grön utan lista', async () => {
  const g = github({ andringar: [{ namn: 'src/pages/om.astro', text: 'x', status: 'modified' }] });
  await kor(grund(g));
  assert.deepEqual([sist(g.v).state, sist(g.v).description], ['success', 'Inga organisationer ändras']);
  assert.equal(listan(g.v), undefined);
});

test('ändras bara regelfiler står det i läget', async () => {
  const g = github({ andringar: [{ namn: 'kriterier.md', text: 'x', status: 'modified' }] });
  await kor(grund(g));
  assert.equal(sist(g.v).state, 'success');
  assert.match(sist(g.v).description, /regel/i);
});

test('en torrkörning skriver ingenting', async () => {
  const g = github({ andringar: [org('exempel')] });
  const ut = await kor(grund(g, { torrt: true }));
  assert.deepEqual(skrivningar(g.v), []);
  assert.equal(ut.resultat.state, 'pending');
  assert.ok(ut.kommentar.startsWith(MARKOR));
});

test('en redigering av en annan kommentar ändrar inte vem som räknas', async () => {
  const g = github({ andringar: [org('exempel')], ratt: { granskare: 'write' } });
  await kor(grund(g));
  redigera(g.v, (b) => bockad(b));
  await kor(grund(g, { handelse: 'issue_comment', avsandare: { login: 'bot[bot]', type: 'Bot' }, redigering: { kommentarId: 424242, fore: 'a', efter: 'b' } }));
  assert.equal(sist(g.v).state, 'success');
});
