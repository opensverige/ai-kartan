import type { APIRoute } from 'astro';
import { etiketter as byggEtiketter, hamtaData, hamtaKunskap } from '../../lib/data';
import type { Fragedata } from '../../lib/fraga/typer';

export const GET: APIRoute = () => {
  const d = hamtaData();
  const body: Fragedata = {
    etiketter: byggEtiketter(d),
    faq: hamtaKunskap(),
    kommuner: d.kommuner.map(({ kod, namn }) => ({ kod, namn })),
    lan: d.lan.map(({ kod, namn }) => ({ kod, namn })),
  };
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
};
