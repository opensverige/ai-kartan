#!/usr/bin/env node
// Bygger ändringshistoriken ur git-historiken för data/organisationer.
// Varje ändrat fält blir en rad: datum, organisation, fält, typ av ändring, gammalt och nytt värde, källa.
// Resultatet skrivs till history/changelog.json och är deterministiskt: samma historik ger samma fil.
//
//   node scripts/andringar.mjs            # skriver history/changelog.json
//   node scripts/andringar.mjs --skriv-ut # skriver bara ut de senaste 30 raderna

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import YAML from 'yaml';
import { ROT, faktaIPost } from './lib/organisationer.mjs';
import { historikenKrymper } from './lib/historik.mjs';

const DATAKATALOG = 'data/organisationer';
const UTFIL = path.join(ROT, 'history', 'changelog.json');
const argv = process.argv.slice(2);
const skrivUt = argv.includes('--skriv-ut');

function git(args) {
  return execFileSync('git', args, { cwd: ROT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function lasVersion(hash, fil) {
  try {
    return YAML.parse(git(['show', `${hash}:${fil}`]));
  } catch {
    return null;
  }
}

/** Plattar en post till jämförbara fält. */
function platta(data) {
  const ut = new Map();
  if (!data) return ut;
  for (const [namn, fakta] of faktaIPost(data)) {
    ut.set(namn, {
      value: fakta.value ?? null,
      status: fakta.status ?? null,
      source_url: fakta.source_url ?? null,
      verified_at: fakta.verified_at ?? null,
    });
  }
  ut.set('website', { value: data.website ?? null, status: null, source_url: data.website ?? null, verified_at: null });
  const belagg = (data.evidence ?? []).map((b) => b.url).filter(Boolean).sort();
  ut.set('evidence', { value: belagg, status: null, source_url: null, verified_at: null });
  if (data.links) ut.set('links', { value: data.links, status: null, source_url: null, verified_at: null });
  return ut;
}

function lika(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function huvud() {
  let logg;
  try {
    // I en grund klon ger git log inget fel, bara färre commits. Då ska filen lämnas orörd.
    if (git(['rev-parse', '--is-shallow-repository']).trim() === 'true') throw new Error('grund klon');
    logg = git(['log', '--reverse', '--date=short', '--format=%H%x09%ad', '--', DATAKATALOG]).trim();
  } catch (e) {
    console.warn('Kunde inte läsa git-historiken (grunt klon eller inget repo). Behåller befintlig history/changelog.json.');
    return;
  }
  const commits = logg ? logg.split('\n').map((rad) => rad.split('\t')) : [];
  const rader = [];

  for (const [hash, datum] of commits) {
    const status = git(['show', '--name-status', '--format=', '--no-renames', hash, '--', DATAKATALOG]).trim();
    if (!status) continue;
    for (const rad of status.split('\n')) {
      const [typ, fil] = rad.split('\t');
      if (!fil || !/\.ya?ml$/.test(fil)) continue;
      const id = path.basename(fil).replace(/\.ya?ml$/, '');
      const fore = typ === 'A' ? null : lasVersion(`${hash}^`, fil);
      const efter = typ === 'D' ? null : lasVersion(hash, fil);
      const namn = efter?.name?.value ?? fore?.name?.value ?? id;
      const bas = { datum, commit: hash.slice(0, 10), id, namn };

      if (typ === 'A' || (!fore && efter)) {
        rader.push({ ...bas, falt: 'hela posten', andring: 'tillagd', gammalt: null, nytt: null, status: null, kalla: efter?.website ?? null });
        continue;
      }
      if (typ === 'D' || (fore && !efter)) {
        rader.push({ ...bas, falt: 'hela posten', andring: 'borttagen', gammalt: null, nytt: null, status: null, kalla: null });
        continue;
      }
      const a = platta(fore);
      const b = platta(efter);
      const falt = new Set([...a.keys(), ...b.keys()]);
      for (const f of falt) {
        const fa = a.get(f);
        const fb = b.get(f);
        if (!fa && fb) {
          rader.push({ ...bas, falt: f, andring: 'ny uppgift', gammalt: null, nytt: fb.value, status: fb.status, kalla: fb.source_url });
        } else if (fa && !fb) {
          rader.push({ ...bas, falt: f, andring: 'borttagen', gammalt: fa.value, nytt: null, status: null, kalla: null });
        } else if (fa && fb && (!lika(fa.value, fb.value) || fa.status !== fb.status)) {
          const andring = lika(fa.value, fb.value) ? 'ny status' : 'ändrad';
          rader.push({ ...bas, falt: f, andring, gammalt: fa.value, nytt: fb.value, status: fb.status, gammal_status: fa.status, kalla: fb.source_url });
        }
      }
    }
  }

  rader.reverse();
  const ut = {
    generated_at: new Date().toISOString().slice(0, 19) + 'Z',
    antal: rader.length,
    senaste_andring: rader[0]?.datum ?? null,
    rader,
  };

  if (skrivUt) {
    for (const r of rader.slice(0, 30)) console.log(`${r.datum}  ${r.namn.padEnd(28)} ${r.falt.padEnd(14)} ${r.andring}`);
    console.log(`${rader.length} rader totalt.`);
    return;
  }
  const gammal = fs.existsSync(UTFIL) ? fs.readFileSync(UTFIL, 'utf8') : '';
  if (historikenKrymper(rader.length, gammal) && !process.argv.includes('--tvinga')) {
    console.error(`Stoppar: ${rader.length} rader ur git men fler i history/changelog.json. Historiken ser avkortad ut. Kör med --tvinga om det är avsikten.`);
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(UTFIL), { recursive: true });
  const text = JSON.stringify(ut, null, 2) + '\n';
  // Skriv bara om raderna ändrats, så att generated_at inte skapar brus.
  const gammalUtanTid = gammal.replace(/"generated_at": "[^"]+"/, '');
  const nyUtanTid = text.replace(/"generated_at": "[^"]+"/, '');
  if (gammalUtanTid !== nyUtanTid) {
    fs.writeFileSync(UTFIL, text, 'utf8');
    console.log(`Skrev ${rader.length} rader till history/changelog.json.`);
  } else {
    console.log(`Inga nya ändringar. history/changelog.json är oförändrad (${rader.length} rader).`);
  }
}

huvud();
