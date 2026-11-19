#!/usr/bin/env node
// Skriver länken som öppnar delningsbladet i vi-form, och ett färdigt meddelande att skicka
// till organisationen. Körs av .github/workflows/delalank.yml när en ny organisation har gått
// in i main, men går också att köra lokalt:
//
//   npm run delalank -- berget-ai accounted      en eller flera organisationer
//   node scripts/delalank.mjs --nya <före> <efter>   de som lagts till mellan två commits
//   --arende                                     texten till tipsärendet i stället för pull requesten
//
// Skriver markdown till terminalen. Finns inget att säga skrivs ingenting.
// Pull requestens kommentar är till den som granskar och har ett meddelande att skicka vidare.
// Tipsärendets kommentar är till den som tipsade, ofta organisationen själv.
// Enskilda firmor hoppas över: namnet är en personuppgift och ska inte stå kvar i en kommentar.

import { execFileSync } from 'node:child_process';
import { lasOrganisationer, ROT } from './lib/organisationer.mjs';
import { delalank, delatext } from '../src/lib/dela.ts';

const SAJT = (process.env.SITE_URL || 'https://karta.opensverige.se').replace(/\/$/, '');
const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const tillArende = process.argv.includes('--arende');
const argv = process.argv.slice(2).filter((a) => a !== '--arende');

/** Id för de organisationsfiler som finns i efter men inte i före. */
function nya(fore, efter) {
  const ut = execFileSync('git', ['diff', '--diff-filter=A', '--name-only', fore, efter, '--', 'data/organisationer'], { cwd: ROT, encoding: 'utf8' });
  return ut
    .split('\n')
    .map((rad) => rad.match(/^data\/organisationer\/(.+)\.ya?ml$/)?.[1])
    .filter((id) => id && ID.test(id));
}

/**
 * Stycket för en organisation. Namnet kommer ur datan, som redan är publik och granskad.
 * Ett snabel-a får ändå inte bli ett omnämnande som skickar besked till någon på GitHub.
 */
function stycke(radnamn, id) {
  const namn = radnamn.replace(/\s+/g, ' ').replace(/@/g, '@\u200b');
  const sida = `${SAJT}/organisation/${id}`;
  const lank = delalank(sida);
  if (tillArende) {
    return [
      `### ${namn}`,
      '',
      `- Sidan: ${sida}`,
      `- Är det ni? Den här länken öppnar sidan med en färdig text att dela: ${lank}`,
    ].join('\n');
  }
  return [
    `### ${namn}`,
    '',
    `- Sidan: ${sida}`,
    `- Delalänk: ${lank}`,
    '',
    'Färdigt att skicka:',
    '',
    `> Hej! ${delatext(namn, false)} Titta gärna att uppgifterna stämmer. Vill ni berätta det ligger en färdig text här: ${lank}`,
  ].join('\n');
}

const iNyaLage = argv[0] === '--nya';
const onskade = iNyaLage ? nya(argv[1], argv[2]) : argv;
if (!iNyaLage && !onskade.length) {
  console.error('Ange minst ett id, eller --nya <före> <efter>.');
  process.exit(1);
}

const poster = new Map(lasOrganisationer().filter((p) => p.data?.id).map((p) => [p.data.id, p.data]));
const stycken = [];
for (const id of onskade) {
  const post = poster.get(id);
  if (!post) {
    if (!iNyaLage) console.error(`Hittar ingen organisation med id ${id}.`);
    continue;
  }
  if (post.type?.value === 'enskild_firma') continue;
  stycken.push(stycke(post.name.value, id));
}

if (stycken.length) {
  if (tillArende) {
    const fot = `Stämmer något inte? Svara här, eller rätta via ${SAJT}/bidra#ratta.`;
    console.log(`Nu på kartan.\n\n${stycken.join('\n\n')}\n\n${fot}`);
  } else {
    const rubrik = iNyaLage ? 'Nu på kartan. Länken öppnar organisationens sida med delningsbladet framme, i vi-form.\n\n' : '';
    console.log(`${rubrik}${stycken.join('\n\n')}`);
  }
}
