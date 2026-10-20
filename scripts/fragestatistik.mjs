#!/usr/bin/env node
// Frågestatistik. Hämtar Fråga kartans loggrader sedan förra körningen ur Vercel och räknar ihop
// dem per dag i en öppen JSON-fil. Körs var femtonde minut av .github/workflows/fragestatistik.yml.
//
//   VERCEL_TOKEN=… node scripts/fragestatistik.mjs --fil statistik/fragestatistik.json
//   Utan VERCEL_TOKEN används inloggningen i Vercels CLI, för att pröva lokalt.
//   … --github    skriver larm=true/false och rapport till $GITHUB_OUTPUT
//
// Skriptet skriver bara ut antal. En rad ur loggen skrivs aldrig ut, inte ens när något går fel,
// eftersom Actions-loggen är öppen.

import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { MAX_RADER, fonster, lasLoggar, laggTill, rapport, tomStatistik } from './lib/fragestatistik.mjs';

const PROJEKT = process.env.VERCEL_PROJEKT ?? 'prj_TrQo0nemf38OYxmhiwkwKy3N4QSo';
const TEAM = process.env.VERCEL_TEAM ?? 'team_joaSVLEv3jfSWBewCGoI5uhb';
/** Låst version, så att loggarnas form inte ändras under körningen utan att någon har valt det. */
const VERCEL_CLI = 'vercel@50.37.2';

const argv = process.argv.slice(2);
const filIndex = argv.indexOf('--fil');
const fil = filIndex >= 0 ? argv[filIndex + 1] : null;
if (!fil) {
  console.error('Ange filen med --fil.');
  process.exit(2);
}
const token = process.env.VERCEL_TOKEN;

const statistik = fs.existsSync(fil) ? JSON.parse(fs.readFileSync(fil, 'utf8')) : tomStatistik();
const nu = Date.now();
const f = fonster(statistik.markor, nu);
if (f.till <= f.fran) {
  console.log('Inget nytt fönster att hämta.');
  process.exit(0);
}

let text;
try {
  text = execFileSync(
    'npx',
    ['--yes', VERCEL_CLI, 'logs', '--project', PROJEKT, '--scope', TEAM, '--environment', 'production', '--no-branch', '--json',
      '--since', new Date(f.fran).toISOString(), '--until', new Date(f.till).toISOString(), '-n', String(MAX_RADER), ...(token ? ['--token', token] : [])],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 },
  );
} catch (fel) {
  // Bara statuskoden. Felets text kan innehålla delar av svaret.
  console.error(`Loggarna gick inte att hämta (status ${fel.status ?? 'okänd'}).`);
  process.exit(1);
}

const { rader, kastade, totalt } = lasLoggar(text);
const { statistik: ny, nyaLarm, nyaLuckor } = laggTill(statistik, rader, f, totalt);
fs.writeFileSync(fil, `${JSON.stringify(ny, null, 2)}\n`);

const utskrift = rapport(f, rader, kastade, nyaLarm, nyaLuckor);
console.log(utskrift);
if (argv.includes('--github') && process.env.GITHUB_OUTPUT) {
  const larm = nyaLarm.length > 0 || nyaLuckor.length > 0;
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `larm=${larm}\nrapport<<RAPPORT_SLUT\n${utskrift}\nRAPPORT_SLUT\n`);
}
