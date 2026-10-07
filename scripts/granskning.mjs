#!/usr/bin/env node
// Skriver granskningslistan på en pull request och sätter kontrollens läge.
// Körs av .github/workflows/granskning.yml, alltid ur main. Pull requestens filer hämtas som
// data genom GitHubs API och körs aldrig. Reglerna för listan står i scripts/lib/granskning.mjs.
//
//   GH_TOKEN=… GITHUB_REPOSITORY=ägare/repo PR_NUMMER=12 HANDELSE=pull_request_target node scripts/granskning.mjs
//   … node scripts/granskning.mjs --torrt     skriver ingenting, visar bara vad som skulle hända

import YAML from 'yaml';
import { arOrganisationsfil, lista, avlas, utfall, MARKOR, KONTEXT, MAX_ORGANISATIONER } from './lib/granskning.mjs';

const torrt = process.argv.includes('--torrt');
const token = process.env.GH_TOKEN ?? '';
const repo = process.env.GITHUB_REPOSITORY ?? '';
const nummer = Number(process.env.PR_NUMMER);
const handelse = process.env.HANDELSE ?? 'pull_request_target';
const avsandare = process.env.AVSANDARE ?? '';

if (!token || !/^[\w.-]+\/[\w.-]+$/.test(repo) || !Number.isInteger(nummer) || nummer <= 0) {
  console.error('Saknar GH_TOKEN, GITHUB_REPOSITORY eller PR_NUMMER.');
  process.exit(1);
}

/** Ett anrop till GitHubs API. Kastar fel på allt annat än 2xx, så att kontrollen aldrig blir grön av misstag. */
async function api(metod, stig, kropp, accept = 'application/vnd.github+json') {
  const svar = await fetch(`https://api.github.com${stig}`, {
    method: metod,
    headers: { Authorization: `Bearer ${token}`, Accept: accept, 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'ai-kartan-granskning', ...(kropp ? { 'Content-Type': 'application/json' } : {}) },
    body: kropp ? JSON.stringify(kropp) : undefined,
  });
  if (!svar.ok) throw new Error(`${metod} ${stig.split('?')[0]} svarade ${svar.status}`);
  return accept.includes('raw') ? svar.text() : svar.json();
}

async function allaSidor(stig, maxSidor) {
  const ut = [];
  for (let sida = 1; sida <= maxSidor; sida++) {
    const del = await api('GET', `${stig}${stig.includes('?') ? '&' : '?'}per_page=100&page=${sida}`);
    ut.push(...del);
    if (del.length < 100) return ut;
  }
  throw new Error(`${stig} har fler än ${maxSidor * 100} rader`);
}

const pr = await api('GET', `/repos/${repo}/pulls/${nummer}`);
// En torrkörning skriver ingenting och får därför titta även på en stängd pull request.
if (pr.state !== 'open' && !torrt) {
  console.log(`Pull request ${nummer} är inte öppen. Inget att göra.`);
  process.exit(0);
}
const sha = pr.head.sha;

// Vilka organisationsfiler rör pull requesten? En fil som byter namn räknas som ny under det nya
// namnet. Flyttas den ut ur mappen räknas den som borttagen.
const filer = [];
for (const f of await allaSidor(`/repos/${repo}/pulls/${nummer}/files`, 30)) {
  if (arOrganisationsfil(f.filename)) {
    filer.push({ sokvag: f.filename, blob: f.sha, status: f.status === 'removed' ? 'removed' : f.status === 'modified' || f.status === 'changed' ? 'modified' : 'added', data: null, fel: null });
  } else if (f.previous_filename && arOrganisationsfil(f.previous_filename)) {
    filer.push({ sokvag: f.previous_filename, blob: f.sha, status: 'removed', data: null, fel: null });
  }
}
filer.sort((a, b) => a.sokvag.localeCompare(b.sokvag));

if (filer.length <= MAX_ORGANISATIONER) {
  for (const fil of filer.filter((f) => f.status !== 'removed')) {
    try {
      const text = await api('GET', `/repos/${repo}/contents/${fil.sokvag}?ref=${sha}`, undefined, 'application/vnd.github.raw+json');
      if (text.length > 200_000) throw new Error('filen är för stor');
      fil.data = YAML.parse(text, { maxAliasCount: 50 });
    } catch (fel) {
      fil.fel = fel.message;
    }
  }
}

// Bara en kommentar som flödet självt har skrivit räknas. Vem som helst kan skriva en kommentar som ser ut som listan.
const kommentarer = await allaSidor(`/repos/${repo}/issues/${nummer}/comments`, 10);
const egen = kommentarer.find((k) => k.user?.type === 'Bot' && k.user?.login === 'github-actions[bot]' && String(k.body).startsWith(MARKOR));

let kropp = egen?.body ?? '';
let vem = '';
if (handelse === 'issue_comment' && egen) {
  // Någon har redigerat listan. Bara den som får skriva i repot får bocka av, och aldrig en bot.
  const ratt = await api('GET', `/repos/${repo}/collaborators/${encodeURIComponent(avsandare)}/permission`).catch(() => null);
  const far = ratt && ['admin', 'maintain', 'write'].includes(ratt.role_name ?? ratt.permission) && ratt.user?.type === 'User';
  if (far) vem = avsandare;
  else kropp = '';
}
// Listan skrivs alltid om ur filerna. Avbockade punkter följer med om filen är oförändrad.
const ny = filer.length || egen ? lista(filer, { repo, sha }, kropp) : '';
const lage = avlas(filer, ny);
const resultat = utfall(lage, lage.klara === lage.totalt ? vem : '');

console.log(`${filer.length} organisationsfiler · ${lage.klara} av ${lage.totalt} punkter avbockade · ${resultat.state}: ${resultat.description}`);
if (torrt) {
  console.log(`\n--- kommentaren ---\n${ny || '(ingen kommentar)'}`);
  process.exit(0);
}

let lank = pr.html_url;
if (ny && ny !== egen?.body) {
  const sparad = egen
    ? await api('PATCH', `/repos/${repo}/issues/comments/${egen.id}`, { body: ny })
    : await api('POST', `/repos/${repo}/issues/${nummer}/comments`, { body: ny });
  lank = sparad.html_url ?? lank;
} else if (egen) {
  lank = egen.html_url;
}
await api('POST', `/repos/${repo}/statuses/${sha}`, { state: resultat.state, context: KONTEXT, description: resultat.description, target_url: lank });
