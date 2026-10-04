import type { APIRoute } from 'astro';
import { hamtaData } from '../../lib/data';

export const GET: APIRoute = () => {
  const d = hamtaData();
  return new Response(
    JSON.stringify(
      {
        license: 'CC-BY-4.0',
        attribution: 'OpenSverige AI-kartan, karta.opensverige.se',
        note: 'Varje rad är ett ändrat fält i datan, byggt ur git-historiken. Historiken är append-only.',
        generated_at: d.andringar.generated_at,
        senaste_andring: d.andringar.senaste_andring,
        antal: d.andringar.rader.length,
        rader: d.andringar.rader,
      },
      null,
      2,
    ),
    { headers: { 'content-type': 'application/json; charset=utf-8' } },
  );
};
