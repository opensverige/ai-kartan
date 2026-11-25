// Pixelbyggets rutnät: det som går att räkna ut utan webbläsare.
//
// En pixelstad ritas ruta för ruta av frivilliga. Rut-tjänsten håller reda på vem som har vilken
// ruta och lämnar ut rutnätet öppet: /v1/sheets (bladen) och /v1/grid/<blad> (rutorna). Allt
// som kommer därifrån är data från andra och läses här, fält för fält, innan något visas.

/** En ruta är 1024 bildpunkter i kartbilden, 256 meter. */
export const RUTA = 1024;
export const REPO = 'https://github.com/opensverige/karta.opensverige-3d';

export type Lage = 'fri' | 'last' | 'vantar' | 'godkand' | 'live';
const LAGEN: readonly string[] = ['fri', 'last', 'vantar', 'godkand', 'live'];

export interface Ruta {
  kol: number;
  rad: number;
  lage: Lage;
  /** Byggarens GitHub-namn, när rutan har en byggare. */
  namn: string | null;
}

export interface Blad {
  id: string;
  namn: string;
  kolumner: number;
  rader: number;
  oppet: boolean;
  /** En plats som frivilliga har börjat rita, inte en stad ritad för hand. */
  rutnat: boolean;
  tanda: number;
  totalt: number;
}

const BLAD_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
// GitHub-namn: bokstäver, siffror och bindestreck. Allt annat visas inte.
const GITHUB_NAMN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;

const heltal = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;

/** Adressen till ett blad eller en ruta, som den står efter # i sidans adress. */
export function ankare(blad: string, kol?: number | null, rad?: number | null): string {
  return kol == null || rad == null ? `#${blad}` : `#${blad}/${kol}_${rad}`;
}

export function lasAnkare(hash: string): { blad: string; kol: number | null; rad: number | null } | null {
  const traff = /^#([a-z0-9][a-z0-9-]{0,63})(?:\/(\d{1,4})_(\d{1,4}))?$/.exec(hash);
  if (!traff) return null;
  return { blad: traff[1], kol: traff[2] === undefined ? null : Number(traff[2]), rad: traff[3] === undefined ? null : Number(traff[3]) };
}

/** Rutan under en punkt i kartbilden, eller null utanför bilden. */
export function rutaVidPunkt(blad: Blad, x: number, y: number): { kol: number; rad: number } | null {
  if (!(x >= 0) || !(y >= 0)) return null;
  const kol = Math.floor(x / RUTA);
  const rad = Math.floor(y / RUTA);
  return kol < blad.kolumner && rad < blad.rader ? { kol, rad } : null;
}

export function lasBlad(v: unknown): Blad | null {
  if (!v || typeof v !== 'object') return null;
  const b = v as Record<string, unknown>;
  if (typeof b.id !== 'string' || !BLAD_ID.test(b.id)) return null;
  if (!heltal(b.cols) || !heltal(b.rows) || b.cols < 1 || b.rows < 1 || b.cols > 2000 || b.rows > 2000) return null;
  return {
    id: b.id,
    namn: typeof b.name === 'string' ? b.name.slice(0, 40) : b.id,
    kolumner: b.cols,
    rader: b.rows,
    oppet: b.state === 'open',
    rutnat: b.made === 'grid',
    tanda: heltal(b.done) ? b.done : 0,
    totalt: heltal(b.total) ? b.total : 0,
  };
}

/** Rutorna i ett blad. Rutor utanför staden ("ute") och rader som inte går att läsa tas inte med. */
export function lasRutor(v: unknown): Ruta[] {
  if (!Array.isArray(v)) return [];
  const rutor: Ruta[] = [];
  for (const rad of v) {
    if (!Array.isArray(rad) || !heltal(rad[0]) || !heltal(rad[1]) || typeof rad[2] !== 'string') continue;
    if (!LAGEN.includes(rad[2])) continue;
    const namn = typeof rad[3] === 'string' && GITHUB_NAMN.test(rad[3]) ? rad[3] : null;
    rutor.push({ kol: rad[0], rad: rad[1], lage: rad[2] as Lage, namn });
  }
  return rutor;
}

export function rakna(rutor: Ruta[]): { tanda: number; godkanda: number; vantar: number; lasta: number; fria: number; totalt: number } {
  const n = { tanda: 0, godkanda: 0, vantar: 0, lasta: 0, fria: 0, totalt: rutor.length };
  for (const r of rutor) {
    if (r.lage === 'live') n.tanda += 1;
    else if (r.lage === 'godkand') n.godkanda += 1;
    else if (r.lage === 'vantar') n.vantar += 1;
    else if (r.lage === 'last') n.lasta += 1;
    else n.fria += 1;
  }
  return n;
}

/** De som har flest tända rutor. Stor och liten bokstav räknas som samma namn. */
export function topplista(rutor: Ruta[], antal = 5): { namn: string; rutor: number }[] {
  const per = new Map<string, { namn: string; rutor: number }>();
  for (const r of rutor) {
    if (r.lage !== 'live' || !r.namn) continue;
    const nyckel = r.namn.toLowerCase();
    const rad = per.get(nyckel) ?? { namn: r.namn, rutor: 0 };
    rad.rutor += 1;
    per.set(nyckel, rad);
  }
  return [...per.values()].sort((a, b) => b.rutor - a.rutor || a.namn.localeCompare(b.namn, 'sv')).slice(0, antal);
}

/**
 * Bladets utgåva enligt bildtjänstens fil karta-utgava.json, eller 0 när bladet inte har någon.
 *
 * Kartbildens bildrutor ändras aldrig på sin adress. När en frivilligs ruta läggs in i kartan
 * får bladet en ny utgåva, och bildrutorna hämtas då som <blad>@<utgåva>_files/...
 * Filen kommer utifrån: allt annat än ett positivt heltal betyder basen.
 */
export function lasUtgava(svar: unknown, blad: string): number {
  const bladen = (svar as { sheets?: unknown } | null)?.sheets;
  if (typeof bladen !== 'object' || bladen === null || Array.isArray(bladen)) return 0;
  const rev = (bladen as Record<string, { rev?: unknown } | null>)[blad]?.rev;
  return typeof rev === 'number' && Number.isInteger(rev) && rev > 0 && rev <= 999_999 ? rev : 0;
}

/** Adressen till bladets kartbild, i utgåvan eller i basen. `bilder` slutar med snedstreck. */
export function kartbild(bilder: string, blad: string, utgava: number): string {
  return utgava > 0 ? `${bilder}${blad}@${utgava}.dzi` : `${bilder}${blad}.dzi`;
}

/** Vad ett blad ritas från. Googles 3D-bilder kräver byggarens eget Cesium-konto. */
export type Kalla = 'oppen' | 'google';
// Bara Göteborg ritas från öppna flygfoton. Alla andra blad, också nya orter, ritas från Google.
const OPPNA: readonly string[] = ['goteborg-norr'];

export function kalla(blad: string): Kalla {
  return OPPNA.includes(blad) ? 'oppen' : 'google';
}

const KRAV_ALLTID: readonly string[] = [
  'Ett NVIDIA-kort med 12 GB minne',
  'Windows eller Linux, inte Mac',
  'Cirka 25 GB ledig disk',
  'Python 3.11 eller nyare, och Git',
  'Ett GitHub-konto. Namnet syns på dina rutor.',
];
const KRAV_GOOGLE: readonly string[] = ['Node 22 eller nyare', 'Ett eget Cesium ion-konto. Det är gratis.'];

/** Det en byggare måste ha för att bygga en ruta på bladet. Samma lista står i repots README. */
export function krav(blad: string): string[] {
  return kalla(blad) === 'google' ? [...KRAV_ALLTID, ...KRAV_GOOGLE] : [...KRAV_ALLTID];
}

/** Raden som en besökare ger till sin AI-agent för att bygga en ruta. */
export function agentrad(blad: string, kol: number, rad: number): string {
  return `Klona ${REPO.replace('https://', '')}. Läs AGENTS.md. Bygg ruta ${blad} ${kol}_${rad}.`;
}

const TEXT: Record<Lage, { namn: string; mening: string }> = {
  fri: { namn: 'Ledig', mening: 'Marken saknas på kartan. Ingen har tagit rutan än.' },
  last: { namn: 'Låst', mening: 'Någon bygger rutan just nu.' },
  vantar: { namn: 'Väntar', mening: 'Rutan är uppladdad och granskas av en människa.' },
  godkand: { namn: 'Godkänd', mening: 'Rutan är godkänd och tänds när kartan uppdateras.' },
  live: { namn: 'Tänd', mening: 'Rutan ligger på kartan.' },
};

export function lage(namn: string): { namn: string; mening: string } {
  return TEXT[namn as Lage] ?? TEXT.fri;
}
