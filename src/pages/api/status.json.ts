import type { APIRoute } from 'astro';
import { hamtaData } from '../../lib/data';

export const GET: APIRoute = () => {
  const d = hamtaData();
  const s = d.statistik;
  const senaste = d.andringar.senaste_andring;
  const dagarSedanAndring = senaste ? Math.floor((Date.now() - new Date(`${senaste}T00:00:00Z`).getTime()) / 86400000) : null;
  return new Response(
    JSON.stringify(
      {
        dataset: d.byggd,
        antal_organisationer: s.antal,
        per_typ: s.per_typ,
        poster_med_minst_ett_bekraftat_falt: s.med_bekraftat,
        andel_med_bekraftat_procent: s.andel_med_bekraftat,
        fakta_per_status: s.fakta_per_status,
        senast_verifierad: s.senast_verifierad,
        senaste_dataandring: senaste,
        dagar_sedan_dataandring: dagarSedanAndring,
        farskhet: {
          larm_logg_10_dagar: dagarSedanAndring === null ? null : dagarSedanAndring > 10,
          poster_over_180_dagar: s.antal_over_180_dagar,
          aldsta_kontroll_dagar: s.aldsta_kontroll_dagar,
        },
        utan_plats: s.utan_plats,
        kommuner: d.platser.kommuner.length,
        lan: d.platser.lan.length,
        license: 'CC-BY-4.0',
      },
      null,
      2,
    ),
    { headers: { 'content-type': 'application/json; charset=utf-8' } },
  );
};
