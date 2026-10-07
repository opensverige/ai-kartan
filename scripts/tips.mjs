#!/usr/bin/env node
// Tar emot ett tips från det korta formuläret "Lägg till en organisation".
// Körs av .github/workflows/tips.yml, men går också att köra lokalt:
//
//   ISSUE_BODY="$(cat arende.md)" node scripts/tips.mjs --svar svar.md --rensad kropp.md
//   node scripts/tips.mjs --fil arende.md
//
// Skriver svaret till ärendet, till --svar eller terminalen. Innehöll ärendet något som ser ut
// som ett personnummer skrivs en rensad ärendetext till --rensad, och flödet får rensad=true
// så att det byter ut texten innan något annat händer.

import fs from 'node:fs';
import { lasOrganisationer } from './lib/organisationer.mjs';
import { bedomTips, skrivSvar } from './lib/tips.mjs';
import { arendetext } from './lib/arende.mjs';

const argv = process.argv.slice(2);
const arg = (namn) => {
  const i = argv.indexOf(namn);
  return i >= 0 ? argv[i + 1] : null;
};

const kropp = arg('--fil') ? fs.readFileSync(arg('--fil'), 'utf8') : arendetext();
if (!kropp.trim()) {
  console.error('Ingen ärendetext. Använd --fil, eller sätt ISSUE_BODY.');
  process.exit(1);
}

const organisationer = lasOrganisationer()
  .filter((p) => p.data)
  .map((p) => ({ id: p.data.id, namn: p.data.name?.value ?? p.data.id, webbplats: p.data.website }));

const resultat = bedomTips(kropp, organisationer);
const svar = skrivSvar(resultat, {
  sajt: (process.env.SITE_URL || 'https://karta.opensverige.se').replace(/\/$/, ''),
  repo: `https://github.com/${process.env.GITHUB_REPOSITORY || 'opensverige/ai-kartan'}`,
  andrad: process.env.ISSUE_ACTION === 'edited',
});

if (arg('--svar')) fs.writeFileSync(arg('--svar'), svar, 'utf8');
else process.stdout.write(svar);
if (resultat.rensadKropp && arg('--rensad')) fs.writeFileSync(arg('--rensad'), resultat.rensadKropp, 'utf8');
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `rensad=${Boolean(resultat.rensadKropp)}\n`);
