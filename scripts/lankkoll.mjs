#!/usr/bin/env node
// Kontrollerar att varje länk i datan svarar. En uppgift vars källa försvunnit ska upptäckas, inte ligga kvar tyst.
//
//   node scripts/lankkoll.mjs                 # alla länkar, rapport, exit 0
//   node scripts/lankkoll.mjs --strikt        # exit 1 om någon länk är död (onåbara länkar rapporteras men stoppar inte)
//   node scripts/lankkoll.mjs --andrade main  # bara filer som skiljer sig från angiven gren (för PR-kontroll)
//   node scripts/lankkoll.mjs --markdown      # rapport som markdown (för ett GitHub-ärende)

import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROT, lasOrganisationer, faktaIPost } from './lib/organisationer.mjs';
import { bedomLank } from './lib/lankar.mjs';

const argv = process.argv.slice(2);
const strikt = argv.includes('--strikt');
const markdown = argv.includes('--markdown');
const andradeIx = argv.indexOf('--andrade');
const bas = andradeIx >= 0 ? argv[andradeIx + 1] : null;
const SAMTIDIGT = 6;
const TIDSGRANS_MS = 20000;
const UA = 'Mozilla/5.0 (compatible; ai-kartan-lankkoll/1.0; +https://github.com/opensverige/ai-kartan)';

let poster = lasOrganisationer().filter((p) => p.data);
if (bas) {
  const diff = execFileSync('git', ['diff', '--name-only', `${bas}...HEAD`, '--', 'data/organisationer'], { cwd: ROT, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
    .map((f) => path.basename(f));
  const valda = new Set(diff);
  poster = poster.filter((p) => valda.has(p.fil));
}

const lankar = new Map(); // url -> [{id, falt}]
function lagg(url, id, falt) {
  if (!url || !/^https?:\/\//.test(url)) return;
  if (!lankar.has(url)) lankar.set(url, []);
  lankar.get(url).push({ id, falt });
}
for (const p of poster) {
  const d = p.data;
  lagg(d.website, d.id, 'website');
  for (const [namn, f] of faktaIPost(d)) lagg(f.source_url, d.id, `${namn}.source_url`);
  for (const b of d.evidence ?? []) lagg(b.url, d.id, 'evidence');
  for (const [k, v] of Object.entries(d.links ?? {})) if (typeof v === 'string') lagg(v, d.id, `links.${k}`);
}

async function kolla(url) {
  const styr = new AbortController();
  const timer = setTimeout(() => styr.abort(), TIDSGRANS_MS);
  try {
    let svar = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: styr.signal, headers: { 'user-agent': UA, accept: '*/*' } });
    if (svar.status === 405 || svar.status === 403 || svar.status === 404 || svar.status >= 500) {
      svar = await fetch(url, { method: 'GET', redirect: 'follow', signal: styr.signal, headers: { 'user-agent': UA, accept: 'text/html,*/*' } });
    }
    return { url, status: svar.status, utfall: bedomLank({ status: svar.status }) };
  } catch (e) {
    // Nodes fetch lägger den egentliga orsaken (ENOTFOUND, ECONNRESET, certifikatfel) i e.cause.
    const fel = e.name === 'AbortError' ? 'timeout' : (e.cause?.code ?? e.message);
    return { url, status: 0, fel, utfall: bedomLank({ status: 0, fel }) };
  } finally {
    clearTimeout(timer);
  }
}

const urler = [...lankar.keys()];
const resultat = [];
let index = 0;
async function arbetare() {
  while (index < urler.length) {
    const url = urler[index++];
    resultat.push(await kolla(url));
  }
}
await Promise.all(Array.from({ length: SAMTIDIGT }, arbetare));

const doda = resultat.filter((r) => r.utfall === 'dod');
const onabara = resultat.filter((r) => r.utfall === 'onabar');
const sammanfattning = `${doda.length} döda, ${onabara.length} gick inte att nå härifrån.`;
if (markdown) {
  console.log(`## Länkkontroll ${new Date().toISOString().slice(0, 10)}\n`);
  console.log(`${urler.length} länkar i ${poster.length} poster kontrollerade. ${sammanfattning}\n`);
  if (doda.length) {
    console.log('| Länk | Svar | Används av |\n|---|---|---|');
    for (const r of doda) console.log(`| ${r.url} | ${r.status || r.fel} | ${lankar.get(r.url).map((a) => `${a.id} (${a.falt})`).join(', ')} |`);
  }
  if (onabara.length) {
    // Som lista, inte tabell: veckoflödet öppnar ett ärende bara när rapporten har tabellrader.
    console.log('\nGick inte att nå härifrån. Öppna dem i en webbläsare innan något ändras:\n');
    for (const r of onabara) console.log(`- ${r.url} (${r.status || r.fel}), används av ${lankar.get(r.url).map((a) => a.id).join(', ')}`);
  }
} else {
  console.log(`${urler.length} länkar kontrollerade i ${poster.length} poster. ${sammanfattning}`);
  for (const r of doda) console.log(`  död\t${r.status || r.fel}\t${r.url}\t← ${lankar.get(r.url).map((a) => a.id).join(', ')}`);
  for (const r of onabara) console.log(`  onåbar\t${r.status || r.fel}\t${r.url}\t← ${lankar.get(r.url).map((a) => a.id).join(', ')}`);
}
process.exit(strikt && doda.length ? 1 : 0);
