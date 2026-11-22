import type { APIRoute } from 'astro';
import { hamtaData } from '../../lib/data';

// Kommunernas mittpunkter och namn, som [lng, lat, namn] per kommunkod. Händerna i medlemsvyn
// står i mitten av den kommun medlemmen har valt, aldrig närmare. Hämtas först när vyn öppnas.
export const GET: APIRoute = () => {
  const d = hamtaData();
  const punkter = Object.fromEntries(d.kommuner.map((k) => [k.kod, [k.lng, k.lat, k.namn]]));
  return new Response(JSON.stringify(punkter), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
};
