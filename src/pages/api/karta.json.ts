import type { APIRoute } from 'astro';
import { hamtaData, tillKartpost } from '../../lib/data';

export const GET: APIRoute = () => {
  const d = hamtaData();
  const body = {
    generated_at: d.byggd,
    license: 'CC-BY-4.0',
    attribution: 'OpenSverige AI-kartan, karta.opensverige.se',
    organisationer: d.organisationer.map(tillKartpost),
  };
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
};
