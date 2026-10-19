#!/usr/bin/env node
// Mäter Fråga kartan mot scripts/fragefall.json.
// Utan FRAGA_API_NYCKEL körs bara reservvägen. Med nyckel körs varje fall en gång per modell.
// Frågornas text och nyckeln skrivs aldrig ut. Exit 0 även när fall blir fel: det här är ett mätverktyg.
//
//   node scripts/prova-fraga.mjs
//   node scripts/prova-fraga.mjs --modell=google/gemma-4-31B-it,annan-modell

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { skapaTolkare } from '../src/lib/fraga/inferens.ts';
import { svara } from '../src/lib/fraga/motor.ts';
import { TIDSGRANS_MS } from '../src/lib/fraga/typer.ts';
import { passarFilter } from '../src/lib/filter.ts';
import { tolka } from '../src/lib/sok.ts';
import { tillSokpost } from '../src/lib/sokindex.ts';

const STANDARDMODELLER = [
  'google/gemma-4-31B-it',
  'mistralai/Mistral-Small-3.2-24B-Instruct-2506',
];
const FALL_ETT = 'datorseende-vasterbotten';
const LISTFALT = ['omrade', 'erbjuder', 'typ'];
const ROT = path.join(import.meta.dirname, '..');
const KARTA_FIL = path.join(ROT, 'dist', 'api', 'karta.json');
const FRAGA_FIL = path.join(ROT, 'dist', 'api', 'fraga-data.json');
const FALL_FIL = path.join(import.meta.dirname, 'fragefall.json');

function lasJson(fil) {
  return JSON.parse(readFileSync(fil, 'utf8'));
}

function byggData(karta, fd) {
  if (!Array.isArray(karta.organisationer) || !fd?.etiketter || !Array.isArray(fd.faq)) {
    throw new Error('dist/api/karta.json eller dist/api/fraga-data.json har inte den form servern väntar sig.');
  }
  return {
    poster: karta.organisationer.map((o) => tillSokpost(o, fd.etiketter)),
    etiketter: fd.etiketter,
    faqIds: fd.faq.map((f) => f.id),
    kommuner: fd.kommuner,
    lan: fd.lan,
  };
}

function lasModeller(argv) {
  const arg = argv.find((del) => del.startsWith('--modell='));
  if (!arg) return STANDARDMODELLER;
  const lista = arg.slice('--modell='.length).split(',').map((del) => del.trim()).filter(Boolean);
  return lista.length ? lista : STANDARDMODELLER;
}

/** Tiden för varje anrop, även när tolkaren kastar. Frågan lämnas inte vidare till loggen. */
function medTid(tolkare) {
  const tider = [];
  if (!tolkare) return { tolkare: null, tider };
  return {
    tider,
    tolkare: async (fraga, tidigare) => {
      const start = performance.now();
      try {
        return await tolkare(fraga, tidigare);
      } finally {
        tider.push(performance.now() - start);
      }
    },
  };
}

function innehallerAlla(vantade, fick) {
  const har = new Set(fick ?? []);
  return Array.isArray(vantade) && vantade.every((v) => har.has(v));
}

function jamfor(vantat, svar) {
  const skillnader = [];
  if (Object.hasOwn(vantat, 'sort') && svar.sort !== vantat.sort) {
    skillnader.push({ falt: 'sort', vantat: vantat.sort, blev: svar.sort });
  }
  for (const falt of LISTFALT) {
    if (Object.hasOwn(vantat, falt) && !innehallerAlla(vantat[falt], svar.filter[falt])) {
      skillnader.push({ falt, vantat: vantat[falt], blev: svar.filter[falt] });
    }
  }
  if (Object.hasOwn(vantat, 'lan') && svar.filter.lan !== vantat.lan) {
    skillnader.push({ falt: 'lan', vantat: vantat.lan, blev: svar.filter.lan });
  }
  if (Object.hasOwn(vantat, 'kommun') && svar.filter.kommun !== vantat.kommun) {
    skillnader.push({ falt: 'kommun', vantat: vantat.kommun, blev: svar.filter.kommun });
  }
  if (Object.hasOwn(vantat, 'manniska') && svar.manniska !== vantat.manniska) {
    skillnader.push({ falt: 'manniska', vantat: vantat.manniska, blev: svar.manniska });
  }
  if (Object.hasOwn(vantat, 'okandPlats') && svar.okandPlats !== vantat.okandPlats) {
    skillnader.push({ falt: 'okandPlats', vantat: vantat.okandPlats, blev: svar.okandPlats });
  }
  if (Object.hasOwn(vantat, 'faq') && !svar.faq.includes(vantat.faq)) {
    skillnader.push({ falt: 'faq', vantat: vantat.faq, blev: svar.faq });
  }
  if (Object.hasOwn(vantat, 'tolkningUtan') && svar.tolkning.includes(vantat.tolkningUtan)) {
    skillnader.push({ falt: 'tolkningUtan', vantat: vantat.tolkningUtan, blev: `innehåller ${vantat.tolkningUtan}` });
  }
  return skillnader;
}

function felaktigaOrganisationer(svar, poster) {
  const tolkning = tolka(svar.filter.q, poster);
  const perId = new Map(poster.map((o) => [o.id, o]));
  const fel = [];
  for (const id of svar.visade) {
    const post = perId.get(id);
    if (!post || !passarFilter(post, svar.filter, tolkning)) fel.push(id);
  }
  return fel;
}

function sammaLista(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  return a.every((del, i) => del === b[i]);
}

function filterNyckel(f) {
  const lista = (v) => [...v].sort().join(',');
  return [f.q, lista(f.erbjuder), lista(f.typ), lista(f.omrade), f.lan, f.kommun].join('\n');
}

/** Närmaste rang i den sorterade listan, avrundat till hela millisekunder. */
function percentil(tider, p) {
  if (tider.length === 0) return null;
  const sorterade = [...tider].sort((a, b) => a - b);
  const index = Math.min(sorterade.length - 1, Math.max(0, Math.ceil((p / 100) * sorterade.length) - 1));
  return Math.round(sorterade[index]);
}

function visaVarde(v) {
  if (Array.isArray(v)) return `[${v.join(',')}]`;
  if (v === '') return '""';
  return String(v);
}

function visaSida(skillnader, sida) {
  return skillnader.map((s) => `${s.falt}=${visaVarde(sida === 'vantat' ? s.vantat : s.blev)}`).join(' ');
}

function andel(ratt, totalt) {
  if (totalt === 0) return '0/0';
  return `${ratt}/${totalt} (${Math.round((100 * ratt) / totalt)} %)`;
}

function formatMs(v) {
  return v === null ? '–' : String(v);
}

function raknaModellfel(resultat) {
  const antal = new Map();
  for (const rad of resultat) {
    const sort = rad.svar?.modellfel;
    if (!sort) continue;
    antal.set(sort, (antal.get(sort) ?? 0) + 1);
  }
  if (antal.size === 0) return 'inga';
  return [...antal.entries()].sort(([a], [b]) => a.localeCompare(b, 'sv')).map(([sort, n]) => `${sort} ${n}`).join(', ');
}

function qEtikett(f, alla) {
  if (!f.q) return '""';
  const samma = alla.every((annan) => annan?.q === f.q);
  return samma ? 'samma' : 'olika';
}

function beskrivFilter(f, alla) {
  const lista = (v) => `[${[...v].sort().join(',')}]`;
  return `erbjuder=${lista(f.erbjuder)} typ=${lista(f.typ)} omrade=${lista(f.omrade)} lan=${visaVarde(f.lan)} kommun=${visaVarde(f.kommun)} q=${qEtikett(f, alla)}`;
}

function stabilitetsrader(resultat) {
  const grupper = new Map();
  for (const rad of resultat) {
    if (!rad.grupp) continue;
    if (!grupper.has(rad.grupp)) grupper.set(rad.grupp, []);
    grupper.get(rad.grupp).push(rad);
  }
  const rader = [];
  for (const [grupp, medlemmar] of grupper) {
    const nycklar = medlemmar.map((m) => (m.svar ? filterNyckel(m.svar.filter) : null));
    const samma = nycklar.length > 0 && nycklar.every((n) => n !== null && n === nycklar[0]);
    rader.push(`stabilitet ${grupp}: ${samma ? 'samma filter' : 'olika filter'}`);
    if (samma) continue;
    const filter = medlemmar.map((m) => m.svar?.filter ?? null);
    for (const m of medlemmar) {
      rader.push(`    ${m.id}  ${m.svar ? beskrivFilter(m.svar.filter, filter) : 'inget svar'}`);
    }
  }
  return rader;
}

function skrivRapport(namn, resultat, urval, tider, felaktiga) {
  const ratt = resultat.filter((r) => r.skillnader.length === 0).length;
  console.log(namn);
  console.log(`  rätt: ${andel(ratt, resultat.length)}`);
  console.log(`  felaktiga organisationer: ${felaktiga.length}`);
  if (felaktiga.length) console.log(`  felaktiga id: ${felaktiga.join(', ')}`);
  console.log(`  p50: ${formatMs(percentil(tider, 50))} ms`);
  console.log(`  p95: ${formatMs(percentil(tider, 95))} ms`);
  console.log(`  modellfel: ${raknaModellfel(resultat)}`);
  for (const rad of stabilitetsrader(resultat)) console.log(`  ${rad}`);
  console.log(`  urval två gånger: ${urval}`);
  for (const rad of resultat) {
    if (rad.skillnader.length === 0) continue;
    console.log(`  fel ${rad.id}  väntat ${visaSida(rad.skillnader, 'vantat')}  blev ${visaSida(rad.skillnader, 'blev')}`);
  }
}

function feltext(e, nyckel) {
  let text = e instanceof Error ? e.message : 'okänt fel';
  if (nyckel) text = text.split(nyckel).join('[nyckel]');
  return text.replace(/\s+/g, ' ').slice(0, 200);
}

async function korEtt(fall, tolkare, data, idag, nyckel) {
  try {
    const svar = await svara(fall.fraga, [], data, tolkare, idag);
    return {
      id: fall.id,
      grupp: fall.grupp ?? null,
      svar,
      skillnader: jamfor(fall.forvantat ?? {}, svar),
      felaktiga: felaktigaOrganisationer(svar, data.poster),
    };
  } catch (e) {
    return {
      id: fall.id,
      grupp: fall.grupp ?? null,
      svar: null,
      skillnader: [{ falt: 'svar', vantat: 'ett svar', blev: feltext(e, nyckel) }],
      felaktiga: [],
    };
  }
}

async function korOmgang(namn, tolkare, tider, fall, data, idag, nyckel) {
  const resultat = [];
  const felaktiga = [];
  for (const ett of fall) {
    const rad = await korEtt(ett, tolkare, data, idag, nyckel);
    resultat.push(rad);
    felaktiga.push(...rad.felaktiga);
  }

  const forsta = fall.find((ett) => ett.id === FALL_ETT);
  let urval = `saknar ${FALL_ETT}`;
  if (forsta) {
    const igen = await korEtt(forsta, tolkare, data, idag, nyckel);
    const ordinarie = resultat.find((rad) => rad.id === FALL_ETT);
    felaktiga.push(...igen.felaktiga);
    if (!ordinarie?.svar || !igen.svar) urval = 'gick inte att jämföra';
    else urval = sammaLista(ordinarie.svar.visade, igen.svar.visade) ? 'samma' : 'olika';
  }

  skrivRapport(namn, resultat, urval, tider, felaktiga);
}

const nyckel = process.env.FRAGA_API_NYCKEL?.trim() ?? '';

if (!existsSync(KARTA_FIL) || !existsSync(FRAGA_FIL)) {
  console.log('Kör npm run build först.');
  process.exit(1);
}

const data = byggData(lasJson(KARTA_FIL), lasJson(FRAGA_FIL));
const fragaData = lasJson(FRAGA_FIL);
const fall = lasJson(FALL_FIL);
if (!Array.isArray(fall)) throw new Error('scripts/fragefall.json ska vara en lista.');

const idag = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm' }).format(new Date());
const bas = process.env.FRAGA_API_BAS?.trim() || 'https://api.berget.ai/v1';
const faq = fragaData.faq.map((f) => ({ id: f.id, fragor: Array.isArray(f.fragor) ? f.fragor : [] }));

if (!nyckel) {
  console.log('Ingen nyckel, bara reservvägen.');
  console.log('');
  await korOmgang('Reservvägen', null, [], fall, data, idag, '');
} else {
  const modeller = lasModeller(process.argv.slice(2));
  for (const modell of modeller) {
    const matt = medTid(skapaTolkare({
      bas,
      nyckel,
      modell,
      tidsgrans: TIDSGRANS_MS,
    }, data.etiketter, faq));
    console.log('');
    await korOmgang(modell, matt.tolkare, matt.tider, fall, data, idag, nyckel);
  }
}
