// Rutnätet över Sverige, som byggkartan ritar det.
//
// Rut-tjänsten delar landet i fasta blad om 0,15 grader nord–syd och 0,25 grader öst–väst. Ett
// blad görs första gången någon tar en ruta där. Reglerna här är tjänstens (service/src/tiling.js
// i opensverige/karta.opensverige-3d), räknade likadant, så att kartan ritar samma rutor som en
// claim tar. Vilken ruta ett klick betyder avgör ändå tjänsten: sidan frågar /v1/place. Det som
// räknas här är bara det som ritas.

import { skapaProjektion, type Kartblad, type Projektion } from '../pixelkarta/geometri.ts';

export const LAT_STEG = 0.15;
export const LON_STEG = 0.25;
const RUTA_M = 256;
const RUTA_NORR = 256 * Math.SQRT2;
const RUTA_PX = 1024;
const MPB = 0.25;
const SVERIGE = { latMin: 55.2, latMax: 69.1, lonMin: 10.9, lonMax: 24.2 };
const METER_PER_GRAD = 111320;
const MIKRO = 1e6;
const LAT_MIKRO = 150000;
const LON_MIKRO = 250000;
const RUTNAT_ID = /^se-n(\d{4})-e(\d{4})$/;
/** Fler blad än så i bild ritas inte: då är kartan för långt ut för att en ruta ska synas. */
const STORST_ANTAL_BLAD = 12;

/** Ett blad som tjänsten räknar ut det, innan någon har tagit en ruta där. */
export interface Ruta0 {
  id: string;
  origin_lat: number;
  origin_lon: number;
  cols: number;
  rows: number;
  x_meters: number;
  y_meters: number;
}

/** Bladets rad, som tjänsten lagrar den. ground_height saknas för ett blad utan rad. */
export interface Bladrad extends Ruta0 {
  ground_height?: number;
}

/** Ett blad redo att rita: dess rad och projektionen från bildpunkt till mark. */
export interface Ritblad {
  rad: Bladrad;
  projektion: Projektion;
}

export interface Ruta {
  kol: number;
  rad: number;
}

function ruta0(latMikro: number, lonMikro: number): Ruta0 | null {
  const origin_lat = latMikro / MIKRO;
  const origin_lon = lonMikro / MIKRO;
  if (origin_lat < SVERIGE.latMin || origin_lat > SVERIGE.latMax || origin_lon < SVERIGE.lonMin || origin_lon > SVERIGE.lonMax) return null;
  const cols = Math.ceil((LON_STEG * METER_PER_GRAD * Math.cos((origin_lat * Math.PI) / 180)) / RUTA_M);
  const rows = Math.ceil((LAT_STEG * METER_PER_GRAD) / RUTA_NORR);
  const n = String(Math.floor(latMikro / 10000)).padStart(4, '0');
  const e = String(Math.floor(lonMikro / 10000)).padStart(4, '0');
  return { id: `se-n${n}-e${e}`, origin_lat, origin_lon, cols, rows, x_meters: (-cols * RUTA_M) / 2, y_meters: (rows * RUTA_M) / 2 };
}

/** Bladet en punkt ligger på, eller null utanför Sverige. Som tjänstens sheetAt. */
export function bladVid(lat: number, lon: number): Ruta0 | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const syd = Math.floor(Math.round(lat * MIKRO) / LAT_MIKRO) * LAT_MIKRO;
  const vast = Math.floor(Math.round(lon * MIKRO) / LON_MIKRO) * LON_MIKRO;
  return ruta0(syd + LAT_MIKRO / 2, vast + LON_MIKRO / 2);
}

/** Bladet med det här namnet, eller null när rutnätet inte ger ut något sådant. Som sheetById. */
export function bladMedId(id: string): Ruta0 | null {
  const t = RUTNAT_ID.exec(id);
  if (!t) return null;
  const blad = bladVid((Number(t[1]) * 10000 + 5000) / MIKRO, (Number(t[2]) * 10000 + 5000) / MIKRO);
  return blad && blad.id === id ? blad : null;
}

/** Mitten av en ruta på marken, nära nog att säga vems mark det är. Som tjänstens cellCentre. */
function mitten(blad: Ruta0, kol: number, rad: number): { lat: number; lon: number } {
  const ost = blad.x_meters + (kol + 0.5) * RUTA_M;
  const norr = (blad.y_meters - (rad + 0.5) * RUTA_M) * Math.SQRT2;
  return {
    lat: blad.origin_lat + norr / METER_PER_GRAD,
    lon: blad.origin_lon + ost / (METER_PER_GRAD * Math.cos((blad.origin_lat * Math.PI) / 180)),
  };
}

/** Om bladet erbjuder rutan: den finns i bladet och dess mitt ligger i bladets egen ruta. */
export function agerRutan(blad: Ruta0, kol: number, rad: number): boolean {
  if (!(kol >= 0 && rad >= 0 && kol < blad.cols && rad < blad.rows)) return false;
  const m = mitten(blad, kol, rad);
  const agare = bladVid(m.lat, m.lon);
  return !!agare && agare.id === blad.id;
}

/** Ett blad att rita, ur en rad från tjänsten eller ett uträknat blad. */
export function bladFranRad(rad: Bladrad): Ritblad {
  const karta: Kartblad = {
    id: rad.id,
    dzi: '',
    heading: 0,
    origin: { lat: rad.origin_lat, lon: rad.origin_lon },
    xMeters: rad.x_meters,
    yMeters: rad.y_meters,
    groundHeight: Number.isFinite(rad.ground_height) ? (rad.ground_height as number) : 0,
    width: rad.cols * RUTA_PX,
    height: rad.rows * RUTA_PX,
    island: '',
    edge: '',
  };
  return { rad, projektion: skapaProjektion(karta, MPB) };
}

/** Rutans fyra hörn på marken och det första igen, som [lon, lat]: en sluten ring för kartan. */
export function rutansHorn(blad: Ritblad, kol: number, rad: number): [number, number][] {
  const p = (x: number, y: number): [number, number] => {
    const m = blad.projektion.tillMark(x * RUTA_PX, y * RUTA_PX);
    return [m.lon, m.lat];
  };
  const a = p(kol, rad);
  return [a, p(kol + 1, rad), p(kol + 1, rad + 1), p(kol, rad + 1), a];
}

/** Bladen i rutnätet som rör en ruta på kartan. Tomt när de är för många: då är kartan för långt ut. */
export function bladIRutan(ruta: { west: number; east: number; south: number; north: number }): Ruta0[] {
  const syd = Math.floor(ruta.south / LAT_STEG);
  const norr = Math.floor(ruta.north / LAT_STEG);
  const vast = Math.floor(ruta.west / LON_STEG);
  const ost = Math.floor(ruta.east / LON_STEG);
  if ((norr - syd + 1) * (ost - vast + 1) > STORST_ANTAL_BLAD) return [];
  const ut: Ruta0[] = [];
  for (let i = syd; i <= norr; i += 1) {
    for (let j = vast; j <= ost; j += 1) {
      const blad = bladVid((i + 0.5) * LAT_STEG, (j + 0.5) * LON_STEG);
      if (blad) ut.push(blad);
    }
  }
  return ut;
}

/** Om en punkt ligger i en stads kartbild, ritad för hand. */
function iStad(stader: readonly Ritblad[], lat: number, lon: number): boolean {
  return stader.some((s) => {
    const p = s.projektion.tillBild(lat, lon);
    return p.x >= 0 && p.y >= 0 && p.x < s.rad.cols * RUTA_PX && p.y < s.rad.rows * RUTA_PX;
  });
}

/** Alla rutor i ett blad som syns i en ruta på kartan, ägda eller inte. */
export function rutorIBild(blad: Ritblad, ruta: { west: number; east: number; south: number; north: number }): Ruta[] {
  // Kartrutans hörn i bladets bild ger vilka kolumner och rader som behöver räknas.
  const hornen = [
    blad.projektion.tillBild(ruta.north, ruta.west),
    blad.projektion.tillBild(ruta.north, ruta.east),
    blad.projektion.tillBild(ruta.south, ruta.west),
    blad.projektion.tillBild(ruta.south, ruta.east),
  ];
  const k0 = Math.max(0, Math.floor(Math.min(...hornen.map((h) => h.x)) / RUTA_PX));
  const k1 = Math.min(blad.rad.cols - 1, Math.floor(Math.max(...hornen.map((h) => h.x)) / RUTA_PX));
  const r0 = Math.max(0, Math.floor(Math.min(...hornen.map((h) => h.y)) / RUTA_PX));
  const r1 = Math.min(blad.rad.rows - 1, Math.floor(Math.max(...hornen.map((h) => h.y)) / RUTA_PX));
  const ut: Ruta[] = [];
  for (let rad = r0; rad <= r1; rad += 1) for (let kol = k0; kol <= k1; kol += 1) ut.push({ kol, rad });
  return ut;
}

/**
 * Rutorna i ett blad från rutnätet som ska ritas i en ruta på kartan: de bladet äger, utom där en
 * stad ritad för hand redan har marken. Tjänsten tar inte emot dem, så de ritas inte.
 */
export function rutorAttRita(blad: Ritblad, stader: readonly Ritblad[], ruta: { west: number; east: number; south: number; north: number }): Ruta[] {
  return rutorIBild(blad, ruta).filter(({ kol, rad }) => {
    if (!agerRutan(blad.rad, kol, rad)) return false;
    const m = mitten(blad.rad, kol, rad);
    return !iStad(stader, m.lat, m.lon);
  });
}
