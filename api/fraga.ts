// Serverfunktionen för Fråga kartan, den enda dynamiska delen av sajten. Allt som går att pröva
// ligger i src/lib/fraga/. Här kopplas det ihop med Vercel: var datan hämtas och vad som loggas.

import type { Kartpost } from '../src/lib/data.ts';
import { tillSokpost } from '../src/lib/sokindex.ts';
import { datakalla, PRODUKTION, skyddskaka, tillatnaUrsprung } from '../src/lib/fraga/datakalla.ts';
import { hanteraFraga, type Hanterardelar } from '../src/lib/fraga/handler.ts';
import { lasTak, skapaDagstak } from '../src/lib/fraga/dagstak.ts';
import { skapaTolkare, type Inferens } from '../src/lib/fraga/inferens.ts';
import type { Motordata, Tolkare } from '../src/lib/fraga/motor.ts';
import { medReserv, RESERV_SENAST_MS } from '../src/lib/fraga/reserv.ts';
import { TIDSGRANS_MS, type Fragedata } from '../src/lib/fraga/typer.ts';
import { skapaVakt } from '../src/lib/fraga/vakt.ts';

const CACHE_MS = 5 * 60 * 1000;
const HAMTA_MS = 4000;
const URSPRUNG = tillatnaUrsprung(process.env);
const cache = new Map<string, { tid: number; data: Motordata }>();

// Utan nyckel finns ingen modell, och svaren går via reservvägen med raden om att AI-tolkningen är pausad.
const INFERENS: Inferens | null = process.env.FRAGA_API_NYCKEL
  ? {
      bas: process.env.FRAGA_API_BAS ?? 'https://api.berget.ai/v1',
      nyckel: process.env.FRAGA_API_NYCKEL,
      // Mistral klarade provet med p95 under 3 s, Gemma inte (specen 5.3.1, provet 2026-10-19).
      modell: process.env.FRAGA_MODELL ?? 'mistralai/Mistral-Small-3.2-24B-Instruct-2506',
      tidsgrans: TIDSGRANS_MS,
    }
  : null;
// Reserven svarar när Berget inte gör det (reserv.ts). Den kräver både nyckel och modell, och får
// den tid som är kvar av TIDSGRANS_MS. Nebius kör i Finland, med nollagring påslagen i konsolen.
const RESERV: Inferens | null =
  process.env.FRAGA_RESERV_NYCKEL && process.env.FRAGA_RESERV_MODELL
    ? {
        bas: process.env.FRAGA_RESERV_BAS ?? 'https://api.tokenfactory.nebius.com/v1',
        nyckel: process.env.FRAGA_RESERV_NYCKEL,
        modell: process.env.FRAGA_RESERV_MODELL,
        tidsgrans: TIDSGRANS_MS - RESERV_SENAST_MS,
      }
    : null;
// En vakt per leverantör och serverinstans, så att en paus gäller alla frågor till den instansen.
const VAKT = skapaVakt();
const VAKT_RESERV = skapaVakt();
const tolkarePerData = new WeakMap<Motordata, Tolkare>();

/** Berget först, Nebius som reserv, och dagstaket runt båda. Null när ingen nyckel finns. */
function byggTolkare(fd: Fragedata): Tolkare | null {
  const forsta = INFERENS ? VAKT.omsluta(skapaTolkare(INFERENS, fd.etiketter, fd.faq)) : null;
  const reserv = RESERV ? VAKT_RESERV.omsluta(skapaTolkare(RESERV, fd.etiketter, fd.faq)) : null;
  const tolkare = forsta && reserv ? medReserv(forsta, reserv) : (forsta ?? reserv);
  return tolkare ? DAGSTAK.omsluta(tolkare) : null;
}

async function lasJson<T>(adress: string, kaka: string | null): Promise<T> {
  const svar = await fetch(adress, { headers: kaka ? { cookie: kaka } : {}, signal: AbortSignal.timeout(HAMTA_MS) });
  if (!svar.ok) throw new Error(`${svar.status} från ${new URL(adress).pathname}`);
  return (await svar.json()) as T;
}

async function hamtaData(req: Request): Promise<Motordata> {
  const bas = datakalla(req.url, URSPRUNG, PRODUKTION);
  const sparad = cache.get(bas);
  if (sparad && Date.now() - sparad.tid < CACHE_MS) return sparad.data;
  const kaka = new URL(req.url).origin === bas ? skyddskaka(req.headers.get('cookie')) : null;
  const [karta, fd] = await Promise.all([
    lasJson<{ organisationer: Kartpost[] }>(`${bas}/api/karta.json`, kaka),
    lasJson<Fragedata>(`${bas}/api/fraga-data.json`, kaka),
  ]);
  const data: Motordata = {
    poster: karta.organisationer.map((o) => tillSokpost(o, fd.etiketter)),
    etiketter: fd.etiketter,
    faqIds: fd.faq.map((f) => f.id),
    kommuner: fd.kommuner,
    lan: fd.lan,
  };
  const tolkare = byggTolkare(fd);
  if (tolkare) tolkarePerData.set(data, tolkare);
  cache.set(bas, { tid: Date.now(), data });
  return data;
}

const idag = (): string => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm' }).format(new Date());
// Högst så många frågor till modellen per dygn och serverinstans (dagstak.ts). Standard 500.
const DAGSTAK = skapaDagstak(lasTak(process.env.FRAGA_DAGSTAK), idag);

const delar: Hanterardelar = {
  ursprung: URSPRUNG,
  hamtaData,
  tolkare: (data) => tolkarePerData.get(data) ?? null,
  idag,
  logga: (rad) => console.log(JSON.stringify(rad)),
};

export function POST(request: Request): Promise<Response> {
  return hanteraFraga(request, delar);
}
