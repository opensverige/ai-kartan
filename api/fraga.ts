// Serverfunktionen för Fråga kartan, den enda dynamiska delen av sajten. Allt som går att pröva
// ligger i src/lib/fraga/. Här kopplas det ihop med Vercel: var datan hämtas och vad som loggas.

import type { Kartpost } from '../src/lib/data.ts';
import { tillSokpost } from '../src/lib/sokindex.ts';
import { datakalla, PRODUKTION, skyddskaka, tillatnaUrsprung } from '../src/lib/fraga/datakalla.ts';
import { hanteraFraga, type Hanterardelar } from '../src/lib/fraga/handler.ts';
import type { Motordata } from '../src/lib/fraga/motor.ts';
import type { Fragedata } from '../src/lib/fraga/typer.ts';

const CACHE_MS = 5 * 60 * 1000;
const HAMTA_MS = 4000;
const URSPRUNG = tillatnaUrsprung(process.env);
const cache = new Map<string, { tid: number; data: Motordata }>();

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
  cache.set(bas, { tid: Date.now(), data });
  return data;
}

const idag = (): string => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm' }).format(new Date());

const delar: Hanterardelar = {
  ursprung: URSPRUNG,
  hamtaData,
  tolkare: null,
  idag,
  logga: (rad) => console.log(JSON.stringify(rad)),
};

export function POST(request: Request): Promise<Response> {
  return hanteraFraga(request, delar);
}
