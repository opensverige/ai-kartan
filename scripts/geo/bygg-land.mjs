// Bygger data/geo/land.json: vilka rutor runt varje kommuns mittpunkt som ligger på land.
// Kartan använder filen för att inte rita en organisation i en sjö eller i havet.
//
//   node scripts/geo/bygg-land.mjs            hämtar brickor (cachas) och skriver filen
//   node scripts/geo/bygg-land.mjs --kontroll skriver inget, jämför bara med filen som finns
//
// Vattnet läses ur samma kartunderlag som kartan visar: OpenFreeMaps vektorbrickor, lagret
// "water". Körs för hand när rutnätet eller kommunernas mittpunkter ändras. Se data/geo/README.md.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { KATALOG_GEO, lasJson } from '../lib/organisationer.mjs';
import { platsnat, packa, flytta, STEG, RADIE } from '../lib/landplatser.mjs';
import { lasLager, iYta, brickpunkt } from '../lib/mvt.mjs';

const STIL = 'https://tiles.openfreemap.org/styles/positron';
const ZOOM = 12;
/** En ruta räknas som land först när punkter så här långt åt sex håll också är land, i meter. */
const MARGINAL = 60;
const SAMTIDIGA = 4;
const UTFIL = path.join(KATALOG_GEO, 'land.json');

const flaggor = process.argv.slice(2);
const baraKontroll = flaggor.includes('--kontroll');
const cacheFlagga = flaggor.indexOf('--cache');
const cache = cacheFlagga >= 0 ? path.resolve(flaggor[cacheFlagga + 1]) : path.join(os.tmpdir(), 'ai-kartan-geo', 'brickor');

async function hamtaJson(url) {
  const svar = await fetch(url);
  if (!svar.ok) throw new Error(`${url} svarade ${svar.status}`);
  return svar.json();
}

/** Brickornas adressmall, tagen ur kartstilen så att vattnet är det besökaren ser. */
async function brickmall() {
  const stil = await hamtaJson(STIL);
  const kalla = Object.values(stil.sources).find((s) => s.type === 'vector');
  if (!kalla) throw new Error('Kartstilen har ingen vektorkälla');
  const beskrivning = kalla.tiles ? kalla : await hamtaJson(kalla.url);
  return beskrivning.tiles[0];
}

const vattenPerBricka = new Map();

/** Vattenytorna i en bricka. Brickan hämtas en gång och sparas i cachen. */
async function vatten(mall, x, y) {
  const nyckel = `${x}/${y}`;
  if (!vattenPerBricka.has(nyckel)) {
    vattenPerBricka.set(
      nyckel,
      (async () => {
        const utgava = mall.match(/planet\/([^/]+)\//)?.[1] ?? 'okand';
        const fil = path.join(cache, utgava, `${ZOOM}-${x}-${y}.pbf`);
        if (!fs.existsSync(fil)) {
          const url = mall.replace('{z}', ZOOM).replace('{x}', x).replace('{y}', y);
          let svar = null;
          for (let forsok = 1; forsok <= 4 && !svar?.ok; forsok++) {
            if (forsok > 1) await new Promise((klar) => setTimeout(klar, 1500 * forsok));
            svar = await fetch(url).catch(() => null);
          }
          if (!svar?.ok) throw new Error(`Brickan ${url} gick inte att hämta`);
          fs.mkdirSync(path.dirname(fil), { recursive: true });
          fs.writeFileSync(fil, Buffer.from(await svar.arrayBuffer()));
        }
        return lasLager(new Uint8Array(fs.readFileSync(fil)), 'water');
      })(),
    );
  }
  return vattenPerBricka.get(nyckel);
}

async function arVatten(mall, lat, lng) {
  const b = brickpunkt(lat, lng, ZOOM, 4096);
  const lager = await vatten(mall, b.x, b.y);
  const p = lager.extent === 4096 ? b : brickpunkt(lat, lng, ZOOM, lager.extent);
  return iYta(lager.ytor, p.px, p.py);
}

/** Rutan och sex punkter runt den. Alla ska vara land för att pricken ska synas ligga på land. */
const PROVPUNKTER = [[0, 0], ...Array.from({ length: 6 }, (_, i) => [Math.cos((i * Math.PI) / 3) * MARGINAL, Math.sin((i * Math.PI) / 3) * MARGINAL])];

async function landmask(mall, kommun, nat) {
  const bitar = [];
  for (const [ost, norr] of nat) {
    let land = true;
    for (const [dx, dy] of PROVPUNKTER) {
      const [lat, lng] = flytta(kommun.lat, kommun.lng, ost + dx, norr + dy);
      if (await arVatten(mall, lat, lng)) {
        land = false;
        break;
      }
    }
    bitar.push(land);
  }
  return bitar;
}

const kommuner = lasJson(path.join(KATALOG_GEO, 'kommuner.json'));
const nat = platsnat();
const mall = await brickmall();
console.log(`Brickor: ${mall}`);
console.log(`Cache:   ${cache}`);

const masker = {};
const antal = {};
const ko = [...kommuner];
let klara = 0;
await Promise.all(
  Array.from({ length: SAMTIDIGA }, async () => {
    for (let kommun = ko.shift(); kommun; kommun = ko.shift()) {
      const bitar = await landmask(mall, kommun, nat);
      masker[kommun.kod] = packa(bitar);
      antal[kommun.kod] = bitar.filter(Boolean).length;
      klara += 1;
      if (klara % 25 === 0 || klara === kommuner.length) console.log(`  ${klara} av ${kommuner.length} kommuner, ${vattenPerBricka.size} brickor`);
    }
  }),
);

const ut = {
  kalla: 'OpenFreeMap (OpenMapTiles), lagret water. © OpenStreetMap-bidragsgivare, ODbL 1.0.',
  brickor: mall.match(/planet\/([^/]+)\//)?.[1] ?? null,
  zoom: ZOOM,
  steg: STEG,
  radie: RADIE,
  marginal: MARGINAL,
  rutor: nat.length,
  kommuner: Object.fromEntries(Object.keys(masker).sort().map((kod) => [kod, masker[kod]])),
};

const trangst = kommuner
  .map((k) => ({ namn: k.namn, land: antal[k.kod], mitten: masker[k.kod][0] >= '8' }))
  .sort((a, b) => a.land - b.land);
console.log(`\nMinst land: ${trangst.slice(0, 12).map((k) => `${k.namn} ${k.land}`).join(', ')}`);
console.log(`Mittpunkten i vatten eller vid strand: ${trangst.filter((k) => !k.mitten).map((k) => k.namn).join(', ') || 'ingen'}`);
console.log(`Land i snitt: ${Math.round(Object.values(antal).reduce((a, b) => a + b, 0) / kommuner.length)} av ${nat.length} rutor`);

const text = `${JSON.stringify(ut, null, 1)}\n`;
if (baraKontroll) {
  const samma = fs.existsSync(UTFIL) && fs.readFileSync(UTFIL, 'utf8') === text;
  console.log(samma ? '\nland.json stämmer med kartunderlaget.' : '\nland.json skiljer sig från kartunderlaget. Kör utan --kontroll för att skriva om den.');
  process.exit(samma ? 0 : 1);
}
fs.writeFileSync(UTFIL, text);
console.log(`\nSkrev ${path.relative(process.cwd(), UTFIL)} (${Math.round(text.length / 1024)} kB).`);
