// En plats och ett område tillsammans ("Datorseende i Göteborg"), och frågorna som platssidorna
// svarar på. Reglerna och meningarna står här, utan data och utan webbläsare, så att de går att pröva.
// Sidorna ligger i src/pages/plats och src/pages/lan.

import { antal, uppraknat } from './text.ts';

/**
 * Så många organisationer krävs för att en plats och ett område ska få en egen sida.
 * Färre ger en tunn sida som säger mindre än platsens egen.
 */
export const MINST_PER_SIDA = 5;

/** Så många namn räknas upp i ett svar. Är de fler sägs antalet, så att ingen väljs ut. */
export const MAX_NAMN = 8;

/** Så många namn ryms i en mening på en sida för plats och område. Är de fler står de bara i listan. */
export const MAX_NAMN_I_MENING = 15;

// Områden som är en teknik, inte en bransch. De står för sig själva i en rubrik: "Datorseende i Lund".
// En bransch får "AI inom" framför: "AI inom hälsa och life science i Lund". Ett nytt område i
// taxonomin räknas som bransch tills det läggs till här, och den formen är aldrig fel.
const TEKNIKER = new Set(['agenter_automation', 'datorseende', 'robotik', 'sprakteknik', 'generell']);

/** Områdets del av adressen. Bygger på id, som aldrig ändras, och inte på etiketten. */
export function amnesslug(id: string): string {
  return id.replaceAll('_', '-');
}

/** Etiketten som den står mitt i en mening: liten bokstav först, resten orörd ("generell AI"). */
export function gemen(etikett: string): string {
  return etikett.charAt(0).toLowerCase() + etikett.slice(1);
}

/** Området som rubrik, utan plats. */
export function amnesrubrik(id: string, etikett: string): string {
  return TEKNIKER.has(id) ? etikett : `AI inom ${gemen(etikett)}`;
}

/** Vad organisationerna gör i området, som slutet av en mening. */
export function amnesverb(id: string, etikett: string): string {
  return TEKNIKER.has(id) ? `arbetar med ${gemen(etikett)}` : `bygger AI inom ${gemen(etikett)}`;
}

/** Hur en plats står i en mening om var organisationerna finns. En kommun är ett säte, ett län en yta. */
export function platsled(typ: 'kommun' | 'lan', namn: string): string {
  return typ === 'kommun' ? `med säte i ${namn}` : `i ${namn}`;
}

interface Amnespost {
  areas: { value: string[] };
  kommun?: { value?: string | null } | null;
}

interface Amnesplats<T> {
  typ: 'kommun' | 'lan';
  organisationer: T[];
}

export interface Platsamne<P, T> {
  plats: P;
  omrade: string;
  organisationer: T[];
}

/**
 * Vilka platser och områden som får en sida tillsammans. Ett län hoppas över när alla dess
 * organisationer i området har säte i samma kommun: kommunens sida säger då exakt samma sak.
 */
export function platsamnen<T extends Amnespost, P extends Amnesplats<T>>(platser: P[], minst: number = MINST_PER_SIDA): Platsamne<P, T>[] {
  const ut: Platsamne<P, T>[] = [];
  for (const plats of platser) {
    const perOmrade = new Map<string, T[]>();
    for (const o of plats.organisationer) {
      for (const omrade of o.areas.value) {
        if (!perOmrade.has(omrade)) perOmrade.set(omrade, []);
        perOmrade.get(omrade)!.push(o);
      }
    }
    for (const [omrade, organisationer] of perOmrade) {
      if (organisationer.length < minst) continue;
      if (plats.typ === 'lan' && new Set(organisationer.map((o) => o.kommun?.value)).size < 2) continue;
      ut.push({ plats, omrade, organisationer });
    }
  }
  return ut;
}

/**
 * Namn i en uppräkning. Har något namn ett komma i sig skiljs namnen åt med semikolon, så att
 * "Institutionen för data- och systemvetenskap, Stockholms universitet" inte läses som två.
 */
export function namnlista(namn: string[]): string {
  if (!namn.some((n) => n.includes(',')) || namn.length < 2) return uppraknat(namn);
  return namn.length === 2 ? namn.join(' och ') : `${namn.slice(0, -1).join('; ')}; och ${namn.at(-1)}`;
}

/** Alla namn i en mening, eller ingenting när de är för många för att läsas. Aldrig ett urval. */
export function namnmening(namn: string[]): string | null {
  return namn.length && namn.length <= MAX_NAMN_I_MENING ? `De är ${namnlista(namn)}.` : null;
}

/** Antal per värde, störst först. Lika många står i den ordning etiketterna jämförs på svenska. */
export function raknade(varden: string[], etikett: (id: string) => string): [string, number][] {
  const per = new Map<string, number>();
  for (const v of varden) per.set(v, (per.get(v) ?? 0) + 1);
  const jamfor = new Intl.Collator('sv');
  return [...per].sort((a, b) => b[1] - a[1] || jamfor.compare(etikett(a[0]), etikett(b[0])));
}

/** "datorseende (13 organisationer), språkteknik (7) och robotik (5)". Ordet skrivs ut en gång. */
function medAntal(rader: [string, number][]): string {
  return uppraknat(rader.map(([etikett, n], i) => `${gemen(etikett)} (${i === 0 ? antal(n, 'organisation', 'organisationer') : n})`));
}

export interface Fraga {
  /** Vad frågan handlar om. Sidan hänger länkar på den. */
  nyckel: 'vilka' | 'omraden' | 'offentliga' | 'erbjuder' | 'kontroll';
  fraga: string;
  /** Ren text. Samma text står på sidan och i den strukturerade datan. */
  svar: string;
}

export interface Fragedata {
  typ: 'kommun' | 'lan';
  namn: string;
  n: number;
  /** "30 bolag, 5 lärosäten och 1 myndighet", från typrad i text.ts. */
  typrad: string;
  /** Etikett och antal per område, störst först. */
  omraden: [string, number][];
  /** Etikett och antal per sak som erbjuds, störst först. */
  erbjuder: [string, number][];
  /** Lärosäten, myndigheter och kommuner på platsen, i den ordning de ska nämnas. */
  offentliga: { slag: 'larosate' | 'myndighet' | 'kommun_region'; plural: string; namn: string[] }[];
  /** Organisationer med minst ett fält bekräftat mot register eller oberoende källa. */
  bekraftade: number;
  /** Senaste kontrollen, som den skrivs på sajten. */
  senast: string | null;
}

const KORT = { larosate: 'lärosäten', myndighet: 'myndigheter', kommun_region: 'kommuner' } as const;
const ENSAMT = { larosate: 'lärosäten och forskningsmiljöer', myndighet: 'myndigheter', kommun_region: 'kommuner och regioner' } as const;

/**
 * Frågorna en platssida svarar på. En fråga ställs bara när datan räcker till ett svar: en plats
 * med en enda organisation får inget svar om vad som är vanligast där.
 */
export function platsfragor(d: Fragedata): Fraga[] {
  const ut: Fraga[] = [];
  ut.push({
    nyckel: 'vilka',
    fraga: `Vilka bygger AI i ${d.namn}?`,
    svar: `${antal(d.n, 'organisation', 'organisationer')} ${platsled(d.typ, d.namn)} bygger AI: ${d.typrad}.`,
  });

  if (d.n >= 3 && (d.omraden[0]?.[1] ?? 0) >= 2) {
    ut.push({
      nyckel: 'omraden',
      fraga: `Vilka AI-områden är vanligast i ${d.namn}?`,
      svar: `De vanligaste områdena i ${d.namn} är ${medAntal(d.omraden.slice(0, 5))}. En organisation kan ha flera områden.`,
    });
  }

  if (d.offentliga.length) {
    // Frågan nämner bara de slag som finns på platsen. Ensamt får ett slag sitt hela namn.
    const vilka = d.offentliga.length === 1 ? ENSAMT[d.offentliga[0].slag] : uppraknat(d.offentliga.map((o) => KORT[o.slag]));
    ut.push({
      nyckel: 'offentliga',
      fraga: `Vilka ${vilka} i ${d.namn} bygger AI?`,
      svar: d.offentliga.map((o) => (o.namn.length > MAX_NAMN ? `${o.plural}: ${o.namn.length} stycken.` : `${o.plural}: ${namnlista(o.namn)}.`)).join(' '),
    });
  }

  if (d.n >= 3 && (d.erbjuder[0]?.[1] ?? 0) >= 2) {
    ut.push({
      nyckel: 'erbjuder',
      fraga: `Vad erbjuder organisationerna i ${d.namn}?`,
      svar: `Det vanligaste är ${medAntal(d.erbjuder.slice(0, 4))}. En organisation kan erbjuda flera saker.`,
    });
  }

  ut.push({
    nyckel: 'kontroll',
    fraga: `Hur är uppgifterna om ${d.namn} kontrollerade?`,
    svar:
      `Varje uppgift har källa, datum och status. ${d.bekraftade} av ${antal(d.n, 'organisation', 'organisationer')} har minst ett fält bekräftat mot register eller oberoende källa. ` +
      `Det som inte är bekräftat är märkt som egen uppgift.${d.senast ? ` Senast kontrollerad: ${d.senast}.` : ''}`,
  });
  return ut;
}

/** Frågorna som schema.org FAQPage. */
export function faqSchema(fragor: Fraga[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: fragor.map((f) => ({ '@type': 'Question', name: f.fraga, acceptedAnswer: { '@type': 'Answer', text: f.svar } })),
  };
}
