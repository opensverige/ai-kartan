#!/usr/bin/env node
// Frågestatistik. Hämtar Fråga kartans loggrader sedan förra körningen ur Vercel och räknar dem
// per dag. Dagen som pågår ligger i tillståndet, som aldrig publiceras. Dagar som är slut flyttas
// till den öppna filen. Körs var femtonde minut av .github/workflows/fragestatistik.yml.
//
//   VERCEL_TOKEN=… node scripts/fragestatistik.mjs --tillstand pagaende.json --publicering statistik/fragestatistik.json
//   Utan VERCEL_TOKEN används inloggningen i Vercels CLI, för att pröva lokalt.
//   … --github    skriver larm=true/false och rapport till $GITHUB_OUTPUT
//
// Skriptet skriver bara ut antal. En rad ur loggen skrivs aldrig ut, inte ens när något går fel,
// eftersom Actions-loggen är öppen.

import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { MAX_RADER, fonster, forloratTillstand, forsegla, lasLoggar, laggTill, oppna, publicera, rapport, tomPublicering } from './lib/fragestatistik.mjs';

const PROJEKT = process.env.VERCEL_PROJEKT ?? 'prj_TrQo0nemf38OYxmhiwkwKy3N4QSo';
const TEAM = process.env.VERCEL_TEAM ?? 'team_joaSVLEv3jfSWBewCGoI5uhb';
/** Låst version, så att loggarnas form inte ändras under körningen utan att någon har valt det. */
const VERCEL_CLI = 'vercel@50.37.2';

const argv = process.argv.slice(2);
const flagga = (namn) => {
  const i = argv.indexOf(namn);
  return i >= 0 ? argv[i + 1] : null;
};
const tillstandsfil = flagga('--tillstand');
const publiceringsfil = flagga('--publicering');
if (!tillstandsfil || !publiceringsfil) {
  console.error('Ange filerna med --tillstand och --publicering.');
  process.exit(2);
}
const las = (fil) => (fs.existsSync(fil) ? JSON.parse(fs.readFileSync(fil, 'utf8')) : null);
const skriv = (fil, v) => fs.writeFileSync(fil, `${JSON.stringify(v, null, 2)}\n`);
const token = process.env.VERCEL_TOKEN;
if (!token && process.env.GITHUB_ACTIONS) {
  console.error('VERCEL_TOKEN saknas. Lägg till hemligheten i repots inställningar.');
  process.exit(2);
}

const nu = Date.now();
const publicering = las(publiceringsfil) ?? tomPublicering();
// Lokalt, utan token, ligger tillståndet i klartext. I GitHub är det alltid förseglat.
const lastTillstand = las(tillstandsfil);
const sparat = lastTillstand && token ? oppna(lastTillstand, token) : lastTillstand;
const forlorat = sparat ? null : forloratTillstand(publicering, nu);
const tillstand = sparat ?? forlorat.tillstand;
const f0 = fonster(tillstand.markor, nu);
const f = forlorat?.lucka ? { ...f0, lucka: forlorat.lucka } : f0;
if (f.till <= f.fran) {
  console.log('Inget nytt fönster att hämta.');
  process.exit(0);
}

let text;
try {
  text = execFileSync(
    'npx',
    ['--yes', VERCEL_CLI, 'logs', '--project', PROJEKT, '--scope', TEAM, '--environment', 'production', '--source', 'serverless', '--no-branch', '--json',
      '--since', new Date(f.fran).toISOString(), '--until', new Date(f.till).toISOString(), '-n', String(MAX_RADER), ...(token ? ['--token', token] : [])],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024, timeout: 5 * 60 * 1000 },
  );
} catch (fel) {
  // Bara statuskoden. Felets text kan innehålla delar av svaret.
  console.error(`Loggarna gick inte att hämta (status ${fel.status ?? 'okänd'}).`);
  process.exit(1);
}

const { rader, kastade, totalt } = lasLoggar(text);
const lagd = laggTill(tillstand, rader, f, totalt);
const { nyaLarm, nyaLuckor } = lagd;
const ut = publicera(lagd.tillstand, publicering);
skriv(tillstandsfil, token ? forsegla(ut.tillstand, token) : ut.tillstand);
if (ut.andrad || !fs.existsSync(publiceringsfil)) skriv(publiceringsfil, ut.publicering);

const utskrift = rapport(f, kastade, nyaLarm, nyaLuckor);
console.log(utskrift);
if (argv.includes('--github') && process.env.GITHUB_OUTPUT) {
  const larm = nyaLarm.length > 0;
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `larm=${larm}\nrapport<<RAPPORT_SLUT\n${utskrift}\nRAPPORT_SLUT\n`);
}
