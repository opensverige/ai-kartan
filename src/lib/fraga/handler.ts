// Serverfunktionens hanterare, utan Vercel och utan nätverk, så att den går att pröva.
// Den avvisar allt som inte är en fråga från sajtens egna adresser, och den loggar aldrig
// frågans text: bara sort, tid och om modellen användes.

import type { Filter } from '../filter.ts';
import type { Etiketter } from '../sokindex.ts';
import { svara, type Motordata, type Tolkare } from './motor.ts';
import { MAX_FRAGOR, MAX_TECKEN, type Tidigare } from './typer.ts';

/** Störst tillåtna kropp i byte. En fråga på 300 tecken och fem tidigare ryms med god marginal. */
export const MAX_KROPP = 4096;

export interface Kropp {
  fraga: string;
  tidigare: Tidigare[];
}

export type Loggrad = { sort: string; ms: number; utanModell: boolean };

export interface Hanterardelar {
  /** Adresser som får fråga, till exempel https://karta.opensverige.se. */
  ursprung: readonly string[];
  /** Får anropet, så att kopplingen kan välja var datan hämtas. */
  hamtaData: (req: Request) => Promise<Motordata>;
  tolkare: Tolkare | null;
  idag: () => string;
  logga: (rad: Loggrad) => void;
}

const LAN = /^\d{2}$/;
const KOMMUN = /^\d{4}$/;

function json(status: number, kropp: unknown, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(kropp), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra },
  });
}

const arObjekt = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function kandaVarden(v: unknown, tabell: Record<string, string>): string[] | null {
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'string' && Object.hasOwn(tabell, x))) return null;
  return v as string[];
}

/** Ett filter ur historiken, bara med värden som finns i taxonomin. Annars null. */
function lasFilter(v: unknown, e: Etiketter): Filter | null {
  if (!arObjekt(v)) return null;
  const { q, erbjuder, typ, omrade, lan, kommun } = v;
  if (typeof q !== 'string' || q.length > MAX_TECKEN) return null;
  if (typeof lan !== 'string' || (lan !== '' && (!LAN.test(lan) || !Object.hasOwn(e.lan, lan)))) return null;
  if (typeof kommun !== 'string' || (kommun !== '' && !KOMMUN.test(kommun))) return null;
  const e1 = kandaVarden(erbjuder, e.erbjuder);
  const e2 = kandaVarden(typ, e.typer);
  const e3 = kandaVarden(omrade, e.omraden);
  if (!e1 || !e2 || !e3) return null;
  return { q, erbjuder: e1, typ: e2, omrade: e3, lan, kommun };
}

const giltigFraga = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0 && v.trim().length <= MAX_TECKEN;

/** Kroppen som en fråga och dess historik, eller ett fel. */
export function lasKropp(v: unknown, e: Etiketter): Kropp | { fel: string } {
  if (!arObjekt(v)) return { fel: 'Kroppen ska vara ett objekt.' };
  if (!giltigFraga(v.fraga)) return { fel: `Frågan ska ha 1–${MAX_TECKEN} tecken.` };
  const tidigare = v.tidigare ?? [];
  if (!Array.isArray(tidigare) || tidigare.length > MAX_FRAGOR - 1) return { fel: `Högst ${MAX_FRAGOR - 1} tidigare frågor.` };
  const ut: Tidigare[] = [];
  for (const t of tidigare) {
    if (!arObjekt(t) || !giltigFraga(t.fraga)) return { fel: 'En tidigare fråga har fel form.' };
    const filter = lasFilter(t.filter, e);
    if (!filter) return { fel: 'Ett tidigare filter har fel form.' };
    ut.push({ fraga: t.fraga.trim(), filter });
  }
  return { fraga: v.fraga.trim(), tidigare: ut };
}

export async function hanteraFraga(req: Request, d: Hanterardelar): Promise<Response> {
  const start = Date.now();
  if (req.method !== 'POST') return json(405, { fel: 'Bara POST.' }, { allow: 'POST' });
  const ursprung = req.headers.get('origin');
  if (!ursprung || !d.ursprung.includes(ursprung)) return json(403, { fel: 'Fel ursprung.' });
  const langd = Number(req.headers.get('content-length') ?? 0);
  if (langd > MAX_KROPP) return json(413, { fel: 'För stor fråga.' });
  const text = await req.text();
  if (new TextEncoder().encode(text).length > MAX_KROPP) return json(413, { fel: 'För stor fråga.' });

  let kropp: unknown;
  try {
    kropp = JSON.parse(text);
  } catch {
    return json(400, { fel: 'Kroppen är inte JSON.' });
  }

  let data: Motordata;
  try {
    data = await d.hamtaData(req);
  } catch {
    d.logga({ sort: 'data-saknas', ms: Date.now() - start, utanModell: true });
    return json(503, { fel: 'Kartans data går inte att läsa just nu.' });
  }

  const k = lasKropp(kropp, data.etiketter);
  if ('fel' in k) return json(400, { fel: k.fel });

  const svar = await svara(k.fraga, k.tidigare, data, d.tolkare, d.idag());
  d.logga({ sort: svar.sort, ms: Date.now() - start, utanModell: svar.utanModell });
  return json(200, svar);
}
