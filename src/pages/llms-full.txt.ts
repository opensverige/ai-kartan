import type { APIRoute } from 'astro';
import { hamtaData, absolutUrl, allaFakta, visaVarde, statusEtikett } from '../lib/data';

export const GET: APIRoute = () => {
  const d = hamtaData();
  const delar: string[] = [];
  delar.push(`# OpenSverige AI-kartan – alla organisationer (dataset ${d.byggd}, ${d.statistik.antal} poster, CC BY 4.0)\n`);
  delar.push('Varje uppgift anges som värde (status, källa, kontrollerad datum). Status: bekräftad = verifierad mot register eller oberoende källa; egen uppgift = organisationens eget ord; planerad = uttalat mål; okänd = inte undersökt.\n');
  for (const o of d.organisationer) {
    delar.push(`\n## ${o.name.value}\nPermalänk: ${absolutUrl(`/organisation/${o.id}`)}\nWebbplats: ${o.website}`);
    for (const { nyckel, etikett, fakta } of allaFakta(o)) {
      const varde = visaVarde(d, o, nyckel, fakta);
      const kalla = fakta.source_url ? `, källa ${fakta.source_url}` : '';
      delar.push(`- ${etikett}: ${varde} (${statusEtikett(d, fakta.status).toLowerCase()}${kalla}, kontrollerad ${fakta.verified_at})`);
    }
    for (const b of o.evidence) delar.push(`- Belägg (${b.kind}): ${b.title ? `${b.title} – ` : ''}${b.url} (${b.status ?? 'claimed'}, ${b.verified_at})`);
  }
  return new Response(delar.join('\n') + '\n', { headers: { 'content-type': 'text/plain; charset=utf-8' } });
};
