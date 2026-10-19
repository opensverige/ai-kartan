// Från en fråga till ett svar. Modellen får bara föreslå filter och en mening.
// Vem som visas, i vilken ordning och om meningen släpps igenom bestäms här.
// Utan modell, eller när tolkaren kastar, används frågetexten direkt.

import { arTomt, filterTillSok, passarFilter, TOMT_FILTER, type Filter } from '../filter.ts';
import { karnord, normalisera, tolka, type Tolkning } from '../sok.ts';
import type { Etiketter } from '../sokindex.ts';
import { arManniska, faqUtanModell, forfilter } from './forfilter.ts';
import { godkandRad, mallrad } from './kontroll.ts';
import { hittaPlats, type Plats } from './platser.ts';
import { matchskal, type Skalpost } from './skal.ts';
import type { Modellfelsort, Modellsvar, Svar, Tidigare } from './typer.ts';
import { arModellfel } from './inferens.ts';
import { urvalsfro, valjUt } from './urval.ts';

export type Tolkare = (fraga: string, tidigare: readonly Tidigare[]) => Promise<Modellsvar | null>;

export interface Motordata {
  poster: readonly Skalpost[];
  etiketter: Etiketter;
  faqIds: readonly string[];
  kommuner: readonly { kod: string; namn: string }[];
  lan: readonly { kod: string; namn: string }[];
}

type FastSort = 'ranking' | 'kontakt' | 'utanfor' | 'opensverige';

interface UrFraga {
  filter: Filter;
  plats: Plats | null;
  okandPlats: string | null;
  manniska: boolean;
  /** Sant när koden tog bort något modellen föreslog. Då stämmer inte modellens mening längre. */
  justerad: boolean;
}

/**
 * Facetter som en liten modell gissar fram ur nästan vilken fråga som helst: "vilka" blir bolag,
 * "bygger" blir egen produkt och "AI" blir generell AI. De gäller bara när frågan säger dem.
 * Provet 2026-10-19 visade att en regel i prompten inte räcker.
 */
const GISSADE: readonly { falt: 'typ' | 'erbjuder' | 'omrade'; id: string; ord: RegExp }[] = [
  { falt: 'typ', id: 'bolag', ord: /(^|[^a-z])(bolag|foretag|company|companies|startup|firma|aktiebolag)/ },
  { falt: 'erbjuder', id: 'produkt', ord: /(^|[^a-z])(produkt|tjanst|app|plattform|api|verktyg|product|tool|saas)/ },
  { falt: 'omrade', id: 'generell', ord: /(^|[^a-z])(generell|general)/ },
];

/** Tar bort gissade facetter som frågan inte säger. Ger listan och om något togs bort. */
function utanGissningar(fraga: string, falt: 'typ' | 'erbjuder' | 'omrade', ids: string[]): { ids: string[]; borttagen: boolean } {
  const text = normalisera(fraga);
  const kvar = ids.filter((id) => {
    const gissad = GISSADE.find((g) => g.falt === falt && g.id === id);
    return !gissad || gissad.ord.test(text);
  });
  return { ids: kvar, borttagen: kvar.length !== ids.length };
}

function arFast(avsikt: string | null): avsikt is 'ranking' | 'kontakt' | 'utanfor' {
  return avsikt === 'ranking' || avsikt === 'kontakt' || avsikt === 'utanfor';
}

function kanda(ids: readonly string[], tabell: Record<string, string>): string[] {
  return ids.filter((id) => Object.hasOwn(tabell, id));
}

function harAnnanFacett(f: Filter): boolean {
  return f.erbjuder.length > 0 || f.typ.length > 0 || f.omrade.length > 0 || f.lan !== '' || f.kommun !== '';
}

function fastSvar(sort: FastSort, utanModell: boolean, modellfel: Modellfelsort | null, faq: readonly string[] = []): Svar {
  return {
    sort,
    tolkning: '',
    filter: TOMT_FILTER,
    borttaget: [],
    okandPlats: null,
    kartlank: '/',
    totalt: 0,
    ids: [],
    visade: [],
    regel: 'alla',
    skal: {},
    faq: [...faq],
    manniska: false,
    utanModell,
    modellfel,
  };
}

/** Modellens svar, eller varför det saknas. Ett fel utan namn räknas som att modellen var nere. */
async function lasModell(
  tolkare: Tolkare | null,
  fraga: string,
  tidigare: readonly Tidigare[],
): Promise<{ m: Modellsvar | null; fel: Modellfelsort | null }> {
  if (!tolkare) return { m: null, fel: 'saknas' };
  try {
    const m = await tolkare(fraga, tidigare);
    return m ? { m, fel: null } : { m: null, fel: 'ogiltig' };
  } catch (e) {
    return { m: null, fel: arModellfel(e) ? e.modellfel : 'nere' };
  }
}

function filterFranModell(m: Modellsvar, data: Motordata, fraga: string): UrFraga {
  const plats = m.plats ? hittaPlats(m.plats, data.kommuner, data.lan) : null;
  // Kartan sätter alltid länet tillsammans med kommunen.
  let lan = '';
  let kommun = '';
  if (plats?.sort === 'kommun') {
    kommun = plats.kod;
    lan = plats.kod.slice(0, 2);
  } else if (plats?.sort === 'lan') {
    lan = plats.kod;
  }
  const erbjuder = utanGissningar(fraga, 'erbjuder', kanda(m.erbjuder, data.etiketter.erbjuder));
  const typ = utanGissningar(fraga, 'typ', kanda(m.typ, data.etiketter.typer));
  const omrade = utanGissningar(fraga, 'omrade', kanda(m.omrade, data.etiketter.omraden));
  return {
    plats,
    okandPlats: m.plats && !plats ? m.plats : null,
    manniska: m.manniska || m.avsikt === 'manniska',
    justerad: erbjuder.borttagen || typ.borttagen || omrade.borttagen,
    filter: {
      // Samma rensning som reservvägen, så att ett verb från modellen inte stoppar varje träff.
      q: karnord(m.sokord.join(' ')),
      erbjuder: erbjuder.ids,
      typ: typ.ids,
      omrade: omrade.ids,
      lan,
      kommun,
    },
  };
}

function filterUtanModell(fraga: string): UrFraga {
  return {
    filter: { ...TOMT_FILTER, q: karnord(fraga) },
    plats: null,
    okandPlats: null,
    manniska: arManniska(fraga),
    justerad: false,
  };
}

function hamta(poster: readonly Skalpost[], filter: Filter): { t: Tolkning; ids: string[] } {
  const t = tolka(filter.q, [...poster]);
  return { t, ids: poster.filter((o) => passarFilter(o, filter, t)).map((o) => o.id) };
}

function tolkningsrad(
  m: Modellsvar | null,
  ur: UrFraga,
  etiketter: Etiketter,
  borttaget: readonly string[],
  orgnamn: readonly string[],
): string {
  const rad = m?.tolkning ?? '';
  if (rad && !ur.justerad && godkandRad(rad, orgnamn) && borttaget.length === 0 && ur.okandPlats === null) return rad;
  return mallrad(ur.filter, etiketter, ur.plats);
}

function svarMed(
  sort: Svar['sort'],
  ur: UrFraga,
  tolkning: string,
  borttaget: string[],
  ids: string[],
  visade: string[],
  regel: 'alla' | 'dagligt',
  skal: Record<string, string[]>,
  utanModell: boolean,
  modellfel: Modellfelsort | null,
): Svar {
  return {
    sort,
    tolkning,
    filter: ur.filter,
    borttaget,
    okandPlats: ur.okandPlats,
    kartlank: arTomt(ur.filter) ? '/' : `/?${filterTillSok(ur.filter)}`,
    totalt: ids.length,
    ids,
    visade,
    regel,
    skal,
    faq: [],
    manniska: ur.manniska,
    utanModell,
    modellfel,
  };
}

export async function svara(
  fraga: string,
  tidigare: readonly Tidigare[],
  data: Motordata,
  tolkare: Tolkare | null,
  idag: string,
): Promise<Svar> {
  const pf = forfilter(fraga);
  if (arFast(pf)) return fastSvar(pf, true, null);

  const { m, fel } = await lasModell(tolkare, fraga, tidigare);
  const utanModell = m === null;
  if (m && arFast(m.avsikt)) return fastSvar(m.avsikt, utanModell, fel);
  if (m?.avsikt === 'opensverige') {
    const kand = m.faq.filter((id) => data.faqIds.includes(id));
    return fastSvar('opensverige', utanModell, fel, kand.length ? kand : faqUtanModell(fraga));
  }
  if (!m && pf === 'opensverige') return fastSvar('opensverige', true, fel, faqUtanModell(fraga));

  const ur = m ? filterFranModell(m, data, fraga) : filterUtanModell(fraga);
  const orgnamn = data.poster.map((o) => o.n);
  if (arTomt(ur.filter)) {
    const rad = tolkningsrad(m, ur, data.etiketter, [], orgnamn);
    // Ett svar med bara Discord är ett starkare besked än en lista, så frågan själv måste säga att
    // den gäller människor. Modellen läser annars "alla som arbetar med AI" som en fråga om folk.
    const sort = ur.manniska && arManniska(fraga) ? 'manniska' : 'bred';
    return svarMed(sort, ur, rad, [], [], [], 'alla', {}, utanModell, fel);
  }

  let filter = ur.filter;
  let borttaget: string[] = [];
  let traff = hamta(data.poster, filter);
  if (traff.ids.length === 0 && filter.q !== '' && harAnnanFacett(filter)) {
    borttaget = filter.q.split(' ');
    filter = { ...filter, q: '' };
    traff = hamta(data.poster, filter);
  }
  const anvant: UrFraga = { ...ur, filter };
  const tolkning = tolkningsrad(m, anvant, data.etiketter, borttaget, orgnamn);
  if (traff.ids.length === 0) return svarMed('tomt', anvant, tolkning, borttaget, [], [], 'alla', {}, utanModell, fel);

  const perId = new Map(data.poster.map((o) => [o.id, o]));
  const { visade, regel } = valjUt(traff.ids, (id) => perId.get(id)?.n ?? '', urvalsfro(idag, filter));
  const skal: Record<string, string[]> = {};
  for (const id of visade) {
    const post = perId.get(id);
    if (post) skal[id] = matchskal(post, filter, traff.t, data.etiketter);
  }
  return svarMed('traffar', anvant, tolkning, borttaget, traff.ids, visade, regel, skal, utanModell, fel);
}
