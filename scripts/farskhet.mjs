#!/usr/bin/env node
// Färskhetslarm. Två regler ur kravlistan:
//   1. Ändringsloggen får inte stå still mer än 10 dagar.
//   2. Ingen post får gå mer än 180 dagar utan omkontroll (senaste verified_at i posten).
//
//   node scripts/farskhet.mjs             # rapport i terminalen, exit 1 vid larm
//   node scripts/farskhet.mjs --json      # maskinläsbar
//   node scripts/farskhet.mjs --github    # skriver larm=true/false och rapport till $GITHUB_OUTPUT
// Sätts DISCORD_WEBHOOK_URL skickas larmet även dit.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROT, lasGeo, lasOrganisationer, harled } from './lib/organisationer.mjs';

const GRANS_LOGG_DAGAR = 10;
const GRANS_KONTROLL_DAGAR = 180;
const argv = process.argv.slice(2);

function senasteDataandring() {
  const loggFil = path.join(ROT, 'history', 'changelog.json');
  if (fs.existsSync(loggFil)) {
    const logg = JSON.parse(fs.readFileSync(loggFil, 'utf8'));
    if (logg.senaste_andring) return logg.senaste_andring;
  }
  try {
    return execFileSync('git', ['log', '-1', '--date=short', '--format=%ad', '--', 'data/organisationer'], { cwd: ROT, encoding: 'utf8' }).trim() || null;
  } catch {
    return null;
  }
}

function dagar(datum) {
  if (!datum) return null;
  return Math.floor((Date.now() - new Date(`${datum}T00:00:00Z`).getTime()) / 86400000);
}

const geo = lasGeo();
const poster = lasOrganisationer().filter((p) => p.data);
const senaste = senasteDataandring();
const loggDagar = dagar(senaste);
const gamla = poster
  .map((p) => ({ id: p.data.id, namn: p.data.name?.value ?? p.data.id, ...harled(p.data, geo) }))
  .filter((p) => p.dagar_sedan_kontroll === null || p.dagar_sedan_kontroll > GRANS_KONTROLL_DAGAR)
  .sort((a, b) => (b.dagar_sedan_kontroll ?? 9999) - (a.dagar_sedan_kontroll ?? 9999));

const larmLogg = loggDagar === null || loggDagar > GRANS_LOGG_DAGAR;
const larmPoster = gamla.length > 0;
const larm = larmLogg || larmPoster;

const rader = [];
rader.push(`Färskhetsrapport ${new Date().toISOString().slice(0, 10)}`);
rader.push(`Senaste dataändring: ${senaste ?? 'okänd'} (${loggDagar ?? '?'} dagar sedan). Gräns ${GRANS_LOGG_DAGAR} dagar: ${larmLogg ? 'LARM' : 'ok'}.`);
rader.push(`Poster utan omkontroll på ${GRANS_KONTROLL_DAGAR} dagar: ${gamla.length} av ${poster.length}. ${larmPoster ? 'LARM' : 'ok'}.`);
for (const p of gamla.slice(0, 50)) rader.push(`  - ${p.namn} (${p.id}): ${p.dagar_sedan_kontroll ?? 'aldrig kontrollerad'} dagar`);
if (gamla.length > 50) rader.push(`  … och ${gamla.length - 50} till`);
const rapport = rader.join('\n');

if (argv.includes('--json')) {
  console.log(JSON.stringify({ larm, larm_logg: larmLogg, larm_poster: larmPoster, senaste_andring: senaste, dagar_sedan_andring: loggDagar, antal_poster: poster.length, gamla }, null, 2));
} else {
  console.log(rapport);
}

if (argv.includes('--github') && process.env.GITHUB_OUTPUT) {
  const avgransare = `RAPPORT_${Date.now()}`;
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `larm=${larm}\nrapport<<${avgransare}\n${rapport}\n${avgransare}\n`);
}

if (larm && process.env.DISCORD_WEBHOOK_URL) {
  const text = rapport.length > 1900 ? rapport.slice(0, 1900) + '\n…' : rapport;
  await fetch(process.env.DISCORD_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    // allowed_mentions: ett organisationsnamn ska aldrig kunna pinga någon på servern.
    body: JSON.stringify({ content: `**AI-kartan: färskhetslarm**\n\`\`\`\n${text}\n\`\`\``, allowed_mentions: { parse: [] } }),
  }).catch((e) => console.error('Discord-anrop misslyckades:', e.message));
}

process.exit(larm && !argv.includes('--github') ? 1 : 0);
