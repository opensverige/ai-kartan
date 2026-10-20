// Det länets sida och länets delningsbild ritas ur: en prick per kommun, datumet och storlekarna.
// Samlat här så att sidan och bilden räknar likadant.

import { hamtaData, formateraDatum, type Plats } from './data';
import { BILDVERSION, KARTRUTA } from './delningsbild.ts';
import { datalage } from './lantext.ts';
import type { Kommunprick, Ritval } from './lankarta.ts';

/** Kartan på länets sida. Pricken för en kommun med en organisation syns, Stockholm täcker inte länet. */
export const SIDKARTA: Ritval = { maxBredd: 440, maxHojd: 460, marginal: 18, radie: { min: 7, steg: 4.5, max: 34 }, tolerans: 1.8, minYta: 8, decimaler: 0 };
/** Kartan i delningsbilden. Större prickar, så att de syns i ett flöde. */
export const BILDKARTA: Ritval = { maxBredd: KARTRUTA.bredd, maxHojd: KARTRUTA.hojd, marginal: 30, radie: { min: 12, steg: 6, max: 56 }, tolerans: 1.2 };

export interface Lanunderlag {
  prickar: Kommunprick[];
  /** Dagen då uppgifterna senast ändrades, som ÅÅÅÅ-MM-DD. */
  lageIso: string;
  /** Samma dag skriven för en läsare: "14 okt 2026". */
  lage: string;
  /** Allt som syns i bilden. Ändras något av det får bilden en ny adress. */
  bildnyckel: string;
}

export function lanunderlag(plats: Plats): Lanunderlag {
  const d = hamtaData();
  const prickar = d.platser.kommuner
    .filter((k) => k.lan_kod === plats.kod)
    .map((k) => ({ kod: k.kod, namn: k.namn, slug: k.slug, lat: k.lat, lng: k.lng, antal: k.organisationer.length }));
  const lageIso = datalage([d.andringar.senaste_andring, ...d.organisationer.map((o) => o.record_updated_at)]) ?? d.byggd;
  return {
    prickar,
    lageIso,
    lage: formateraDatum(lageIso),
    bildnyckel: JSON.stringify([BILDVERSION, plats.namn, plats.organisationer.length, lageIso, prickar.map((p) => [p.kod, p.antal])]),
  };
}
