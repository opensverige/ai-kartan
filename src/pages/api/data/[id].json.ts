import type { APIRoute } from 'astro';
import { hamtaData } from '../../../lib/data';
import { exportPost } from '../data.json';

export function getStaticPaths() {
  return hamtaData().organisationer.map((o) => ({ params: { id: o.id } }));
}

export const GET: APIRoute = ({ params }) => {
  const d = hamtaData();
  const o = d.perId.get(params.id!);
  if (!o) return new Response('Finns inte', { status: 404 });
  const body = {
    version: d.byggd,
    license: 'CC-BY-4.0',
    attribution: 'OpenSverige AI-kartan, karta.opensverige.se',
    organisation: exportPost(o),
    andringar: d.andringar.rader.filter((r) => r.id === o.id),
  };
  return new Response(JSON.stringify(body, null, 2), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
};
