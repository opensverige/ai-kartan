// Länets delningsbild och kartan på länets sida, ritade i bygget. Kartan är SVG. Bilden är samma
// karta på sajtens gula yta, med länets namn, antalet och datumet, och görs till PNG i
// src/pages/bild/lan/[slug].png.ts. Texten ritas som banor ur sajtens egna typsnitt, så att bilden
// ser likadan ut på alla datorer och inte beror på vilka typsnitt byggservern har.

import fs from 'node:fs';
import path from 'node:path';
import { create, type Font } from 'fontkitten';
import { ROT } from '../../scripts/lib/organisationer.mjs';
import { ritaLan, type Geometri, type Kommunprick, type Ritad, type Ritval } from './lankarta.ts';
import { antal } from './text.ts';
import { belagda, kortAdress } from './lantext.ts';

/** Höjs när bildens utseende ändras, så att delningstjänsterna hämtar den nya bilden. */
export const BILDVERSION = 1;
export const BILD = { bredd: 1200, hojd: 630 };

const FARG = {
  gul: '#FFD60A',
  svart: '#17130C',
  rod: '#D5382E',
  land: '#FFF8D6',
};

interface Geofeature {
  properties: { kod: string; lan_kod?: string };
  geometry: Geometri;
}

let geo: { lan: Map<string, Geometri>; kommuner: Map<string, Geometri[]> } | null = null;

function lasGeo() {
  if (geo) return geo;
  const las = (fil: string) => (JSON.parse(fs.readFileSync(path.join(ROT, 'public', 'geo', fil), 'utf8')) as { features: Geofeature[] }).features;
  const kommuner = new Map<string, Geometri[]>();
  for (const f of las('kommuner.geojson')) {
    const lan = f.properties.lan_kod ?? f.properties.kod.slice(0, 2);
    if (!kommuner.has(lan)) kommuner.set(lan, []);
    kommuner.get(lan)!.push(f.geometry);
  }
  geo = { lan: new Map(las('lan.geojson').map((f) => [f.properties.kod, f.geometry])), kommuner };
  return geo;
}

/** Länets karta med en prick per kommun. Kastar om länet saknar form i geodatan. */
export function lanritning(lanKod: string, prickar: Kommunprick[], val: Ritval): Ritad {
  const g = lasGeo();
  const form = g.lan.get(lanKod);
  if (!form) throw new Error(`Länet ${lanKod} saknas i public/geo/lan.geojson. Kör scripts/geo/bygg-geodata.py.`);
  return ritaLan(form, g.kommuner.get(lanKod) ?? [], prickar, val);
}

const typsnitt = new Map<string, Font>();

/** Ett av sajtens typsnitt ur public/fonts. Variabla typsnitt läses i sin förvalda vikt. */
export function lasTypsnitt(fil: 'BricolageGrotesque-latin.woff2' | 'JetBrainsMono-latin.woff2'): Font {
  if (!typsnitt.has(fil)) {
    const f = create(fs.readFileSync(path.join(ROT, 'public', 'fonts', fil)));
    if (!('glyphsForString' in f)) throw new Error(`${fil} är en samling, inte ett typsnitt.`);
    typsnitt.set(fil, f);
  }
  return typsnitt.get(fil)!;
}

/** Tecken i texten som typsnittet saknar. En tom lista betyder att texten går att rita. */
export function saknadeTecken(font: Font, text: string): string[] {
  return [...new Set([...text])].filter((t) => !/\s/.test(t) && !font.hasGlyphForCodePoint(t.codePointAt(0)!));
}

/** Textens bredd i pixlar vid en viss storlek. */
export function textbredd(font: Font, text: string, storlek: number): number {
  return (font.glyphsForString(text).reduce((s, g) => s + g.advanceWidth, 0) * storlek) / font.unitsPerEm;
}

/** Största storleken, i hela pixlar, där texten ryms i bredden. Aldrig större än max eller mindre än min. */
export function passandeStorlek(font: Font, texter: string[], maxBredd: number, max: number, min: number): number {
  let s = max;
  while (s > min && texter.some((t) => textbredd(font, t, s) > maxBredd)) s--;
  return s;
}

/** Texten som SVG-banor. `y` är baslinjen. En kontur ritas under fyllningen, i pixlar. */
export function textSvg(font: Font, text: string, storlek: number, x: number, y: number, fyll: string, kontur?: { farg: string; bredd: number }): string {
  const skala = storlek / font.unitsPerEm;
  const streck = kontur ? ` stroke="${kontur.farg}" stroke-width="${Math.round((kontur.bredd / skala) * 10) / 10}" stroke-linejoin="round" paint-order="stroke"` : '';
  let fram = 0;
  const glyfer = font.glyphsForString(text).map((g) => {
    const d = g.path.toSVG();
    const ut = d ? `<path transform="translate(${fram} 0)" d="${d}"/>` : '';
    fram += g.advanceWidth;
    return ut;
  });
  return `<g fill="${fyll}"${streck} transform="translate(${x} ${y}) scale(${skala} ${-skala})">${glyfer.join('')}</g>`;
}

export interface Bildunderlag {
  namn: string;
  n: number;
  /** Datumet som det skrivs, till exempel "14 okt 2026". */
  lage: string;
  adress: string;
  karta: Ritad;
}

/** Kartans plats på bilden: höger halva, med luft runt om. */
export const KARTRUTA = { x: 690, y: 40, bredd: 470, hojd: 550 };

/** Hela delningsbilden som SVG, 1200 × 630. */
export function delningsbildSvg(u: Bildunderlag): string {
  const rubrik = lasTypsnitt('BricolageGrotesque-latin.woff2');
  const mono = lasTypsnitt('JetBrainsMono-latin.woff2');
  const vanster = 64;
  const textbredden = KARTRUTA.x - vanster - 40;
  // Länets namn får ta den plats det behöver, men "AI i" står alltid på en egen rad ovanför.
  const namnStorlek = passandeStorlek(rubrik, ['AI i', u.namn], textbredden, 92, 56);
  const antalText = antal(u.n, 'organisation', 'organisationer');
  const antalStorlek = passandeStorlek(rubrik, [antalText], textbredden, 60, 40);
  const k = u.karta;
  const dx = KARTRUTA.x + (KARTRUTA.bredd - k.bredd) / 2;
  const dy = KARTRUTA.y + (KARTRUTA.hojd - k.hojd) / 2;
  // Alla prickar först och talen sist, minst först, så att det största talet alltid syns helt.
  const prickar = k.prickar.map((p) => `<circle cx="${p.x}" cy="${p.y}" r="${p.r}" fill="${FARG.rod}" stroke="${FARG.svart}" stroke-width="3"/>`).join('');
  const tal = [...k.prickar]
    .reverse()
    .map((p) => {
      // Talet står i pricken när det ryms. En ensam organisation är bara en prick.
      const text = String(p.antal);
      const storlek = Math.floor(Math.min(p.r * 0.95, (p.r * 1.5 * 100) / textbredd(rubrik, text, 100)));
      return p.antal > 1 && storlek >= 12 ? textSvg(rubrik, text, storlek, p.x - textbredd(rubrik, text, storlek) / 2, p.y + storlek * 0.36, '#FFFFFF', { farg: FARG.rod, bredd: Math.max(3, storlek * 0.16) }) : '';
    })
    .join('');
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${BILD.bredd}" height="${BILD.hojd}" viewBox="0 0 ${BILD.bredd} ${BILD.hojd}">`,
    `<rect width="${BILD.bredd}" height="${BILD.hojd}" fill="${FARG.gul}"/>`,
    textSvg(mono, kortAdress(u.adress), 24, vanster, 84, FARG.svart),
    textSvg(rubrik, 'AI i', namnStorlek, vanster, 220, FARG.svart),
    textSvg(rubrik, u.namn, namnStorlek, vanster, 220 + namnStorlek * 1.02, FARG.svart),
    textSvg(rubrik, antalText, antalStorlek, vanster, 430, FARG.svart),
    textSvg(mono, `hittills ${belagda(u.n)} · läget ${u.lage}`, 24, vanster, 476, FARG.svart),
    textSvg(mono, 'Källa och datum på varje uppgift', 20, vanster, 574, FARG.svart),
    `<g transform="translate(${dx} ${dy})">`,
    // Gränserna klipps mot länets form och kanten ritas sist, så att de inte sticker ut utanför den.
    `<defs><clipPath id="form"><path d="${k.land}"/></clipPath></defs>`,
    `<path d="${k.land}" fill="${FARG.land}" fill-rule="evenodd"/>`,
    `<path d="${k.granser}" fill="none" stroke="${FARG.svart}" stroke-opacity="0.22" stroke-width="1.2" stroke-linejoin="round" clip-path="url(#form)"/>`,
    `<path d="${k.land}" fill="none" stroke="${FARG.svart}" stroke-width="3" stroke-linejoin="round"/>`,
    prickar,
    tal,
    `</g>`,
    `</svg>`,
  ].join('');
}
