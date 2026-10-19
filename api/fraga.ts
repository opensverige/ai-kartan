// Serverfunktionen för Fråga kartan. Just nu ett prov på driften: visar att en Vercel-funktion i
// api/ kan använda modulerna i src/lib/. Hanteraren ersätter provet i nästa steg av bygget.

import { filterTillSok, TOMT_FILTER } from '../src/lib/filter.ts';

export function POST(): Response {
  return new Response(JSON.stringify({ ok: true, prov: filterTillSok({ ...TOMT_FILTER, omrade: ['halsa'] }) }), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}
