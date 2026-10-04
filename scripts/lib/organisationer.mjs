// Gemensam läsare för datan. Används av validering, bygge, ändringslogg och färskhetskontroll.
// Ingen magi: läser YAML-filer från data/organisationer, taxonomi från data/taxonomi
// och geodata från data/geo. Härleder län, position och färskhet.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

/** Projektroten: katalogen som innehåller data/taxonomi. Fungerar både från scripts/ och från Astros byggkatalog. */
function hittaRot() {
  const starter = [process.cwd(), path.resolve(fileURLToPath(new URL('../../', import.meta.url)))];
  for (const start of starter) {
    let dir = start;
    for (let i = 0; i < 8; i++) {
      if (fs.existsSync(path.join(dir, 'data', 'taxonomi'))) return dir;
      const upp = path.dirname(dir);
      if (upp === dir) break;
      dir = upp;
    }
  }
  return process.cwd();
}
export const ROT = process.env.AI_KARTAN_ROT ? path.resolve(process.env.AI_KARTAN_ROT) : hittaRot();
export const KATALOG_ORG = path.join(ROT, 'data', 'organisationer');
export const KATALOG_TAX = path.join(ROT, 'data', 'taxonomi');
export const KATALOG_GEO = path.join(ROT, 'data', 'geo');
export const SCHEMA_FIL = path.join(ROT, 'schema', 'organisation.schema.json');

const FAKTAFALT = ['name', 'legal_name', 'type', 'org_number', 'description', 'offers', 'areas', 'kommun', 'coordinates', 'founded', 'active'];

export function lasJson(fil) {
  return JSON.parse(fs.readFileSync(fil, 'utf8'));
}

export function lasTaxonomi() {
  const las = (namn) => lasJson(path.join(KATALOG_TAX, `${namn}.json`));
  return {
    typer: las('typer'),
    erbjuder: las('erbjuder'),
    omraden: las('omraden'),
    status: las('status'),
    kalltyper: las('kalltyper'),
    belaggstyper: las('belaggstyper'),
  };
}

export function lasGeo() {
  const kommunFil = path.join(KATALOG_GEO, 'kommuner.json');
  const lanFil = path.join(KATALOG_GEO, 'lan.json');
  if (!fs.existsSync(kommunFil) || !fs.existsSync(lanFil)) return null;
  const kommuner = lasJson(kommunFil);
  const lan = lasJson(lanFil);
  return {
    kommuner,
    lan,
    kommunPerKod: new Map(kommuner.map((k) => [k.kod, k])),
    lanPerKod: new Map(lan.map((l) => [l.kod, l])),
  };
}

/** Läser alla organisationsfiler. Returnerar råa poster utan härledningar. */
export function lasOrganisationer() {
  if (!fs.existsSync(KATALOG_ORG)) return [];
  const filer = fs.readdirSync(KATALOG_ORG).filter((f) => f.endsWith('.yaml') || f.endsWith('.yml')).sort();
  return filer.map((fil) => {
    const sokvag = path.join(KATALOG_ORG, fil);
    const text = fs.readFileSync(sokvag, 'utf8');
    let data = null;
    let fel = null;
    try {
      data = YAML.parse(text, { prettyErrors: true });
    } catch (e) {
      fel = e.message;
    }
    return { fil, sokvag, text, data, fel };
  });
}

/** Alla fakta i en post som [namn, fakta]-par, inklusive belägg. */
export function faktaIPost(data) {
  const ut = [];
  for (const f of FAKTAFALT) {
    if (data && data[f] && typeof data[f] === 'object') ut.push([f, data[f]]);
  }
  return ut;
}

export function senastVerifierad(data) {
  let senast = null;
  for (const [, fakta] of faktaIPost(data)) {
    for (const d of [fakta.verified_at, fakta.corroborated_at]) {
      if (d && (!senast || d > senast)) senast = d;
    }
  }
  for (const b of data?.evidence ?? []) {
    if (b.verified_at && (!senast || b.verified_at > senast)) senast = b.verified_at;
  }
  return senast;
}

export function dagarSedan(datum, idag = new Date()) {
  if (!datum) return null;
  const d = new Date(`${datum}T00:00:00Z`);
  return Math.floor((idag.getTime() - d.getTime()) / 86400000);
}

/** Deterministisk liten förskjutning så att punkter i samma kommun inte ligger exakt på varandra. */
export function forskjutning(id, lat, maxMeter = 1800) {
  let h = 2166136261;
  for (const c of id) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619) >>> 0;
  }
  const vinkel = ((h % 3600) / 3600) * Math.PI * 2;
  const radie = (((h >>> 12) % 1000) / 1000) ** 0.5 * maxMeter;
  const dLat = (radie * Math.cos(vinkel)) / 111320;
  const dLng = (radie * Math.sin(vinkel)) / (111320 * Math.cos((lat * Math.PI) / 180));
  return { dLat, dLng };
}

/**
 * Härleder fält som sajten behöver: län, kommunnamn, position, färskhet.
 * Positionen är kommunens mittpunkt med liten förskjutning, om inte exakta koordinater finns.
 */
export function harled(data, geo) {
  const kommunKod = data.kommun?.value ?? null;
  const kommun = kommunKod && geo ? geo.kommunPerKod.get(kommunKod) ?? null : null;
  const lanKod = kommunKod ? kommunKod.slice(0, 2) : null;
  const lan = lanKod && geo ? geo.lanPerKod.get(lanKod) ?? null : null;

  let position = null;
  let positionTyp = null;
  if (data.coordinates?.value) {
    position = { lat: data.coordinates.value.lat, lng: data.coordinates.value.lng };
    positionTyp = 'exakt';
  } else if (kommun) {
    const { dLat, dLng } = forskjutning(data.id, kommun.lat);
    position = { lat: +(kommun.lat + dLat).toFixed(5), lng: +(kommun.lng + dLng).toFixed(5) };
    positionTyp = 'kommun';
  }

  const senast = senastVerifierad(data);
  const statusar = faktaIPost(data).map(([, f]) => f.status);
  return {
    kommun_namn: kommun?.namn ?? null,
    kommun_slug: kommun?.slug ?? null,
    lan_kod: lanKod,
    lan_namn: lan?.namn ?? null,
    lan_slug: lan?.slug ?? null,
    position,
    position_typ: positionTyp,
    senast_verifierad: senast,
    dagar_sedan_kontroll: dagarSedan(senast),
    antal_bekraftade: statusar.filter((s) => s === 'confirmed').length,
    antal_fakta: statusar.length,
  };
}
