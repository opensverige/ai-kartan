// Veckopulsen: vad som hänt på kartan de senaste sju dagarna, räknat ur ändringshistoriken.
// Sajten byggs bara när något ändras, och en vecka som räknats vid bygget står kvar när dagarna
// går. Därför räknas veckan två gånger ur samma underlag: vid bygget, och i webbläsaren med
// dagens datum. Reglerna står här, utan webbläsare, så att de går att pröva. Komponenten som
// använder dem är src/components/Veckopuls.astro.

/** En rad ur history/changelog.json, så mycket som veckan behöver. */
export interface Historikrad {
  datum: string;
  id: string;
  namn: string;
  falt: string;
  andring: string;
}

/** En organisation som lagts till, och när. */
export interface Nykomling {
  datum: string;
  id: string;
  namn: string;
}

export interface Veckodag {
  datum: string;
  nya: number;
  uppdaterade: number;
  borttagna: number;
}

/** Det sidan bär med sig till webbläsaren. Storleken beror inte på hur mycket som hänt. */
export interface Veckounderlag {
  /** Dagar där något hänt, från sex dagar före bygget och framåt. */
  dagar: Veckodag[];
  /** De senast tillagda som finns kvar, nyast först. Den första visas när veckan är tom. */
  senaste: Nykomling[];
}

export interface Vecka {
  fran: string;
  till: string;
  /** Sju dagar, äldst först. */
  dagar: { datum: string; nya: number }[];
  nya: number;
  uppdaterade: number;
  borttagna: number;
  /** Veckans nya vid namn, nyast först. Kan vara färre än `nya`, se `Veckounderlag.senaste`. */
  namn: Nykomling[];
  senast: Nykomling | null;
}

export const VECKANS_DAGAR = 7;
const HELA_POSTEN = 'hela posten';
const MANADER = ['jan', 'feb', 'mars', 'april', 'maj', 'juni', 'juli', 'aug', 'sep', 'okt', 'nov', 'dec'];
const VECKODAGAR = ['sön', 'mån', 'tis', 'ons', 'tors', 'fre', 'lör'];

const somDag = (datum: string) => new Date(`${datum}T00:00:00Z`);

/** Dagen i Sverige som ÅÅÅÅ-MM-DD. Veckan byter dag vid svensk midnatt, var besökaren än sitter. */
export function dagensDatum(nu: Date = new Date()): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit' }).format(nu);
}

/** Stapelns höjd i procent av den högsta. En dag med något på syns alltid, en tom dag har ingen stapel. */
export function stapelhojd(nya: number, storst: number): number {
  if (nya <= 0 || storst <= 0) return 0;
  return Math.max(12, Math.round((nya / storst) * 100));
}

/** Datumet `dagar` dagar bort, som ÅÅÅÅ-MM-DD. */
export function flyttaDag(datum: string, dagar: number): string {
  const d = somDag(datum);
  d.setUTCDate(d.getUTCDate() + dagar);
  return d.toISOString().slice(0, 10);
}

export function veckodag(datum: string): string {
  return VECKODAGAR[somDag(datum).getUTCDay()];
}

/** "10 okt". Månaderna skrivs som i formateraDatum i data.ts. */
export function kortDatum(datum: string): string {
  const d = somDag(datum);
  return `${d.getUTCDate()} ${MANADER[d.getUTCMonth()]}`;
}

/** "6–12 okt", eller "28 sep–4 okt" över ett månadsskifte. */
export function datumspann(fran: string, till: string): string {
  const sammaManad = fran.slice(0, 7) === till.slice(0, 7);
  return `${sammaManad ? somDag(fran).getUTCDate() : kortDatum(fran)}–${kortDatum(till)}`;
}

/** Orden efter talen, böjda efter dem: "1 ny organisation", "19 nya organisationer". */
export function veckoord(tal: Pick<Vecka, 'nya' | 'uppdaterade' | 'borttagna'>): { kort: string; nya: string; uppdaterade: string; borttagna: string } {
  return {
    kort: tal.nya === 1 ? 'ny' : 'nya',
    nya: tal.nya === 1 ? 'ny organisation' : 'nya organisationer',
    uppdaterade: tal.uppdaterade === 1 ? 'uppdaterad uppgift' : 'uppdaterade uppgifter',
    borttagna: tal.borttagna === 1 ? 'borttagen' : 'borttagna',
  };
}

/**
 * Räknar ihop historiken till det veckan behöver. `rader` står nyast först, som i filen.
 *
 * En organisation är ny den dag den senast lades till, om den finns kvar. En som lagts till och
 * sedan tagits bort är alltså inte ny: dess sida finns inte att länka till.
 */
export function veckounderlag(rader: Historikrad[], idag: string, antalNamn = 8): Veckounderlag {
  const fran = flyttaDag(idag, -(VECKANS_DAGAR - 1));
  const dagar = new Map<string, Veckodag>();
  const dag = (datum: string) => {
    if (!dagar.has(datum)) dagar.set(datum, { datum, nya: 0, uppdaterade: 0, borttagna: 0 });
    return dagar.get(datum)!;
  };
  const sedda = new Set<string>();
  const senaste: Nykomling[] = [];

  for (const r of rader) {
    const iVeckan = r.datum >= fran;
    if (r.falt !== HELA_POSTEN) {
      if (iVeckan) dag(r.datum).uppdaterade++;
      continue;
    }
    if (r.andring === 'borttagen' && iVeckan) dag(r.datum).borttagna++;
    // Den nyaste raden om hela posten säger om organisationen finns kvar, och i så fall sedan när.
    if (sedda.has(r.id)) continue;
    sedda.add(r.id);
    if (r.andring !== 'tillagd') continue;
    if (iVeckan) dag(r.datum).nya++;
    if (senaste.length < antalNamn) senaste.push({ datum: r.datum, id: r.id, namn: r.namn });
  }
  return { dagar: [...dagar.values()].sort((a, b) => a.datum.localeCompare(b.datum)), senaste };
}

/** Veckan som slutar `idag`, ur ett underlag som kan vara byggt en tidigare dag. */
export function veckan(underlag: Veckounderlag, idag: string): Vecka {
  const fran = flyttaDag(idag, -(VECKANS_DAGAR - 1));
  const perDatum = new Map(underlag.dagar.map((d) => [d.datum, d]));
  const dagar = Array.from({ length: VECKANS_DAGAR }, (_, i) => {
    const datum = flyttaDag(fran, i);
    return perDatum.get(datum) ?? { datum, nya: 0, uppdaterade: 0, borttagna: 0 };
  });
  const summa = (falt: 'nya' | 'uppdaterade' | 'borttagna') => dagar.reduce((s, d) => s + d[falt], 0);
  return {
    fran,
    till: idag,
    dagar: dagar.map((d) => ({ datum: d.datum, nya: d.nya })),
    nya: summa('nya'),
    uppdaterade: summa('uppdaterade'),
    borttagna: summa('borttagna'),
    namn: underlag.senaste.filter((n) => n.datum >= fran && n.datum <= idag),
    senast: underlag.senaste[0] ?? null,
  };
}
