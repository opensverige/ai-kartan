// Händelser på kartsidan och i listan, räknade utöver sidvisningarna. Kartan är en enda adress:
// den som öppnar tio organisationer ger en sidvisning och ser ut att ha vänt i dörren. Händelserna
// säger om en besökare gjorde något och ungefär vad, aldrig vad hen sökte på, filtrerade på eller
// öppnade. Reglerna står här, utan webbläsare, så att de går att pröva. Räkneskriptet laddas i
// src/components/Besoksrakning.astro, och vad som sparas står på /integritet.

/**
 * Varje händelse med egenskaperna den får bära och värdena de får ha. Inget annat lämnar
 * webbläsaren. Vercel tar emot högst två egenskaper per händelse på Pro.
 */
export const HANDELSER = {
  /** Kartan och organisationerna är ritade. Jämförs med sidvisningarna: hur många väntade så länge? */
  karta_ritad: { tid: ['under 2 s', '2 till 4 s', '4 till 8 s', 'över 8 s', 'i bakgrunden'] },
  /** Det första besökaren gör på sidan. Andelen besök med en sådan är måttet på om kartan används. */
  forsta_handling: { typ: ['karta', 'blad', 'sok', 'filter', 'fraga', 'lista', 'medlemmar', 'ai'] },
  org_oppnad: { via: ['karta', 'lista', 'sok'] },
  utlank: { mal: ['webbplats', 'ai-infra', 'annan'] },
  lagg_till: { fran: ['sidhuvud', 'panel', 'lista'] },
  /** Fråga kartan gav ett svar. Bara svarets sort följer med, aldrig frågan. */
  fraga_stalld: { sort: ['traffar', 'bred', 'tomt', 'manniska', 'ranking', 'kontakt', 'opensverige', 'utanfor'] },
  /** Ett klick i svaret: en organisation, Visa alla på kartan, Discord eller Kopiera frågan. */
  fraga_klick: { mal: ['organisation', 'alla_pa_kartan', 'discord', 'kopiera'] },
  fraga_tumme: { svar: ['ja', 'nej'] },
} as const;

export type Handelsenamn = keyof typeof HANDELSER;
export type Tidsklass = (typeof HANDELSER.karta_ritad.tid)[number];
export type Handling = (typeof HANDELSER.forsta_handling.typ)[number];
export type Oppnadvia = (typeof HANDELSER.org_oppnad.via)[number];
export type Utlanksmal = (typeof HANDELSER.utlank.mal)[number];
export type Laggtillfran = (typeof HANDELSER.lagg_till.fran)[number];
export type Fragesort = (typeof HANDELSER.fraga_stalld.sort)[number];
export type Frageklick = (typeof HANDELSER.fraga_klick.mal)[number];
export type Fragetumme = (typeof HANDELSER.fraga_tumme.svar)[number];

export type Skicka = (namn: string, data: Record<string, unknown>) => void;

/** Tiden sägs i fyra steg. Ett exakt tal säger mer om besökarens telefon än vi behöver veta. */
export function tidsklass(ms: number): Tidsklass {
  if (ms < 2000) return 'under 2 s';
  if (ms < 4000) return '2 till 4 s';
  if (ms < 8000) return '4 till 8 s';
  return 'över 8 s';
}

/** Sant om händelsen finns, bär just sina egenskaper och varje värde står i listan ovan. */
export function tillaten(namn: string, data: Record<string, unknown>): boolean {
  if (!Object.hasOwn(HANDELSER, namn)) return false;
  const egenskaper: Record<string, readonly string[]> = HANDELSER[namn as Handelsenamn];
  const nycklar = Object.keys(data);
  if (nycklar.length !== Object.keys(egenskaper).length) return false;
  return nycklar.every((nyckel) => Object.hasOwn(egenskaper, nyckel) && egenskaper[nyckel].includes(data[nyckel] as string));
}

/**
 * Skickar till Vercels räkneskript, om det finns. Lokalt, i förhandsvisningar och hos den som har
 * bett att inte bli spårad finns det inte, och då händer ingenting. Det som inte är tillåtet stoppas
 * här, så att ett slarvigt anrop längre upp aldrig kan bli en söktext hos Vercel.
 */
export function tillVercel(fonster: { va?: (...argument: unknown[]) => void }): Skicka {
  return (namn, data) => {
    if (!tillaten(namn, data)) return;
    fonster.va?.('event', { name: namn, data });
  };
}

export interface Handelser {
  /**
   * Räknas första gången. Kartan ritas om vid varje filter, men frågan är hur länge besökaren väntade.
   * En flik som inte syns ritar inga bildrutor. Låg sidan i bakgrunden under tiden sägs det i stället
   * för en tid, som annars skulle se ut som en lång väntan.
   */
  kartaRitad(ms: number, iBakgrunden?: boolean): void;
  /** Räknas första gången, och svarar då sant. */
  handling(typ: Handling): boolean;
  harHandlat(): boolean;
  orgOppnad(via: Oppnadvia): void;
  utlank(mal: Utlanksmal): void;
  laggTill(fran: Laggtillfran): void;
  fragaStalld(sort: Fragesort): void;
  fragaKlick(mal: Frageklick): void;
  fragaTumme(svar: Fragetumme): void;
}

export function skapaHandelser(skicka: Skicka): Handelser {
  let ritad = false;
  let handlat = false;
  return {
    kartaRitad(ms, iBakgrunden = false) {
      if (ritad) return;
      ritad = true;
      skicka('karta_ritad', { tid: iBakgrunden ? 'i bakgrunden' : tidsklass(ms) });
    },
    handling(typ) {
      if (handlat) return false;
      handlat = true;
      skicka('forsta_handling', { typ });
      return true;
    },
    harHandlat: () => handlat,
    orgOppnad: (via) => skicka('org_oppnad', { via }),
    utlank: (mal) => skicka('utlank', { mal }),
    laggTill: (fran) => skicka('lagg_till', { fran }),
    fragaStalld: (sort) => skicka('fraga_stalld', { sort }),
    fragaKlick: (mal) => skicka('fraga_klick', { mal }),
    fragaTumme: (svar) => skicka('fraga_tumme', { svar }),
  };
}
