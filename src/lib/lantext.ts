// Texterna som gör ett län delbart: antalet som hittills belagt, citatet, bildens alt-text och
// tipsraden. Samlade här så att sidan, bilden och citatet säger samma tal och samma datum.

import { antal } from './text.ts';

/** Ordet böjt efter antalet: "1 organisation, hittills belagd", men "2 … belagda". */
export function belagda(n: number): string {
  return n === 1 ? 'belagd' : 'belagda';
}

/** "15 organisationer, hittills belagda" eller "1 organisation, hittills belagd". */
export function hittillsBelagda(n: number): string {
  return `${antal(n, 'organisation', 'organisationer')}, hittills ${belagda(n)}`;
}

/**
 * Dagen då uppgifterna senast ändrades: den senaste av ändringshistorikens dag och postens egna
 * datum. Samma dag ger samma bild och samma citat, oavsett hur ofta sajten byggs.
 */
export function datalage(datum: (string | null | undefined)[]): string | null {
  return datum.filter((d): d is string => !!d && /^\d{4}-\d{2}-\d{2}/.test(d)).map((d) => d.slice(0, 10)).sort().at(-1) ?? null;
}

/** Adressen utan protokoll, som den skrivs i ett citat eller på en bild. */
export function kortAdress(adress: string): string {
  return adress.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

/** En mening att klistra in i en artikel eller på en lektion. */
export function lancitat(n: number, namn: string, lage: string, adress: string): string {
  return `${antal(n, 'organisation', 'organisationer')} bygger AI i ${namn}, enligt OpenSverige AI-kartan (läget ${lage}). ${kortAdress(adress)}. Data: CC BY 4.0.`;
}

/** Bildens alt-text säger det bilden säger. */
export function bildtext(n: number, namn: string, kommuner: { namn: string; antal: number }[], lage: string): string {
  const per = kommuner.map((k) => `${k.namn} ${k.antal}`).join(', ');
  return `Karta över ${namn} med en prick per kommun. ${hittillsBelagda(n)}: ${per}. Läget ${lage}.`;
}

/** Frågan under kartan. */
export function tipsfraga(namn: string): string {
  return `Vet du fler i ${namn}?`;
}
