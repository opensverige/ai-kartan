// Ordningen: hela länsnamn ("Stockholms län"), sedan kommunnamn, sedan länsnamn utan "län"
// ("Västerbotten"). Inom varje grupp prövas det längsta namnet först, och ett namn träffar bara i
// början av ett ord. Annars träffar Gotland inuti Östergötland, och ett län vinner över kommunen
// med samma namn.

import { normalisera } from '../sok.ts';

export interface Plats {
  sort: 'kommun' | 'lan';
  kod: string;
  namn: string;
}

/** "Västerbottens län" jämförs som "vasterbotten". "s län" måste prövas före " län". */
function lanNyckel(namn: string): string {
  const n = normalisera(namn);
  if (n.endsWith('s lan')) return n.slice(0, -'s lan'.length).trim();
  if (n.endsWith(' lan')) return n.slice(0, -' lan'.length).trim();
  return n;
}

interface MedNyckel {
  kod: string;
  namn: string;
  nyckel: string;
}

/** Namnet står som helt ord eller som början av ett ord. Inte som del mitt i ett ord. */
function traffarNamn(text: string, nyckel: string): boolean {
  if (!nyckel) return false;
  const monster = nyckel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^a-z0-9])${monster}`).test(text);
}

function langstForst(rader: MedNyckel[]): MedNyckel[] {
  return [...rader].sort((a, b) => b.nyckel.length - a.nyckel.length);
}

function forst(text: string, rader: MedNyckel[]): MedNyckel | undefined {
  return langstForst(rader).find((rad) => traffarNamn(text, rad.nyckel));
}

/** Ord för hela landet. Som plats begränsar de inget, och de är inte heller en okänd plats. */
const HELA_LANDET = new Set(['sverige', 'hela sverige', 'i sverige', 'sweden', 'hela landet', 'landet']);

export function arHelaLandet(text: string): boolean {
  return HELA_LANDET.has(normalisera(text).trim().replace(/\s+/g, ' '));
}

export function hittaPlats(
  text: string,
  kommuner: readonly { kod: string; namn: string }[],
  lan: readonly { kod: string; namn: string }[],
): Plats | null {
  const hay = normalisera(text);
  // Hela länsnamnet först: "Stockholms län" är länet, fast kommunen Stockholm står i början av det.
  const helaLan = forst(hay, lan.map((l) => ({ kod: l.kod, namn: l.namn, nyckel: normalisera(l.namn) })));
  if (helaLan) return { sort: 'lan', kod: helaLan.kod, namn: helaLan.namn };
  const kommun = forst(hay, kommuner.map((k) => ({ kod: k.kod, namn: k.namn, nyckel: normalisera(k.namn) })));
  if (kommun) return { sort: 'kommun', kod: kommun.kod, namn: kommun.namn };
  const traff = forst(hay, lan.map((l) => ({ kod: l.kod, namn: l.namn, nyckel: lanNyckel(l.namn) })));
  return traff ? { sort: 'lan', kod: traff.kod, namn: traff.namn } : null;
}
