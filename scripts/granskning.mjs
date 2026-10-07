#!/usr/bin/env node
// Skriver granskningslistan på en pull request och sätter kontrollens läge.
// Körs av .github/workflows/granskning.yml, alltid ur main. Pull requestens filer hämtas som
// data genom GitHubs API och körs aldrig. Reglerna för listan står i scripts/lib/granskning.mjs
// och själva körningen i scripts/lib/granskningskorning.mjs.
//
//   GH_TOKEN=… GITHUB_REPOSITORY=ägare/repo PR_NUMMER=12 HANDELSE=pull_request_target node scripts/granskning.mjs
//   … node scripts/granskning.mjs --torrt     skriver ingenting, visar bara vad som skulle hända

import fs from 'node:fs';
import { kor, ApiFel } from './lib/granskningskorning.mjs';

const torrt = process.argv.includes('--torrt');
const token = process.env.GH_TOKEN ?? '';
const repo = process.env.GITHUB_REPOSITORY ?? '';
const nummer = Number(process.env.PR_NUMMER);
const handelse = process.env.HANDELSE ?? 'workflow_dispatch';

if (!token || !/^[\w.-]+\/[\w.-]+$/.test(repo) || !Number.isInteger(nummer) || nummer <= 0) {
  console.error('Saknar GH_TOKEN, GITHUB_REPOSITORY eller PR_NUMMER.');
  process.exit(1);
}

const paus = (ms) => new Promise((klar) => setTimeout(klar, ms));

/**
 * Ett anrop till GitHubs API. Kastar fel på allt annat än 2xx, så att kontrollen aldrig blir grön
 * av misstag. Läsningar som möter ett tillfälligt fel prövas tre gånger.
 */
async function api(metod, stig, kropp) {
  const forsok = metod === 'GET' ? 3 : 1;
  for (let n = 1; ; n++) {
    let svar = null;
    try {
      svar = await fetch(`https://api.github.com${stig}`, {
        method: metod,
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'ai-kartan-granskning', ...(kropp ? { 'Content-Type': 'application/json' } : {}) },
        body: kropp ? JSON.stringify(kropp) : undefined,
      });
    } catch (fel) {
      if (n >= forsok) throw fel;
    }
    if (svar?.ok) return svar.json();
    if (svar && (svar.status < 500 || n >= forsok)) throw new ApiFel(metod, stig, svar.status);
    await paus(1500 * n);
  }
}

// Vem som redigerade listan, och hur den såg ut före och efter, står i händelsen som startade flödet.
let avsandare = null;
let redigering = null;
if (handelse === 'issue_comment' && process.env.GITHUB_EVENT_PATH) {
  const h = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  avsandare = { login: h.sender?.login, type: h.sender?.type };
  redigering = { kommentarId: h.comment?.id, fore: h.changes?.body?.from ?? '', efter: h.comment?.body ?? '' };
}

const korning = process.env.GITHUB_RUN_ID ? `${process.env.GITHUB_SERVER_URL ?? 'https://github.com'}/${repo}/actions/runs/${process.env.GITHUB_RUN_ID}` : null;

try {
  const ut = await kor({ api, repo, nummer, handelse, avsandare, redigering, torrt, korning });
  if (torrt && !ut.hoppad) console.log(`\n--- kommentaren ---\n${ut.kommentar || '(ingen kommentar)'}`);
} catch (fel) {
  console.error(`Granskningen gick inte att köra: ${fel.message}`);
  process.exit(1);
}
