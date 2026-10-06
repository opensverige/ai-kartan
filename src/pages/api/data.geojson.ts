import type { APIRoute } from 'astro';
import { hamtaData, absolutUrl } from '../../lib/data';

export const GET: APIRoute = () => {
  const d = hamtaData();
  const body = {
    type: 'FeatureCollection',
    license: 'CC-BY-4.0',
    attribution:
      'OpenSverige AI-kartan, karta.opensverige.se. Positioner på kommunnivå om inte position_typ = exakt: en ruta på land nära kommunens mittpunkt, utan samband med adressen. Land och vatten: © OpenStreetMap-bidragsgivare.',
    generated_at: d.byggd,
    features: d.organisationer
      .filter((o) => o.h.position)
      .map((o) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [o.h.position!.lng, o.h.position!.lat] },
        properties: {
          id: o.id,
          name: o.name.value,
          type: o.type.value,
          offers: o.offers.value,
          areas: o.areas.value,
          kommun_kod: o.kommun.value,
          kommun: o.h.kommun_namn,
          lan_kod: o.h.lan_kod,
          lan: o.h.lan_namn,
          website: o.website,
          url: absolutUrl(`/organisation/${o.id}`),
          position_typ: o.h.position_typ,
          senast_verifierad: o.h.senast_verifierad,
          antal_bekraftade: o.h.antal_bekraftade,
        },
      })),
  };
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/geo+json; charset=utf-8' },
  });
};
