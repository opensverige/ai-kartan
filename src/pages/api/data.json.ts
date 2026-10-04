import type { APIRoute } from 'astro';
import { hamtaData, absolutUrl, SAJT } from '../../lib/data';

export function exportPost(o: ReturnType<typeof hamtaData>['organisationer'][number]) {
  const { h, ...data } = o;
  return { ...data, url: absolutUrl(`/organisation/${o.id}`), harlett: h };
}

export const GET: APIRoute = () => {
  const d = hamtaData();
  const body = {
    version: d.byggd,
    generated_at: new Date().toISOString(),
    license: 'CC-BY-4.0',
    attribution: 'OpenSverige AI-kartan, karta.opensverige.se',
    source: SAJT.repo,
    schema: `${SAJT.repo}/blob/main/schema/organisation.schema.json`,
    note:
      'Varje fält är en uppgift med value, status (confirmed|claimed|planned|unknown|not_applicable), source_url, source_type och verified_at. Citera alltid status och datum tillsammans med värdet. Fältet harlett är beräknat vid bygget: län, position på kommunnivå och färskhet.',
    antal: d.statistik.antal,
    statistik: d.statistik,
    organisationer: d.organisationer.map(exportPost),
  };
  return new Response(JSON.stringify(body, null, 2), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
};
