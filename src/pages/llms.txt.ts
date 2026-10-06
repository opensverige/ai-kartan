import type { APIRoute } from 'astro';
import { hamtaData, absolutUrl, SAJT } from '../lib/data';

export const GET: APIRoute = () => {
  const d = hamtaData();
  const s = d.statistik;
  const text = `# OpenSverige AI-kartan (Tech Embassy – Sveriges öppna AI-karta)

> Öppen, oberoende karta över organisationer som bygger AI i Sverige: bolag, myndigheter, kommuner och regioner, lärosäten, communities, finansiärer och infrastruktur. Varje uppgift har källa, datum och verifieringsstatus (confirmed/bekräftad, claimed/egen uppgift, planned/planerad, unknown/okänd). Ingen rankning, inga betalplatser. Data CC BY 4.0, kod AGPL-3.0. Byggd ideellt inom OpenSverige med samma metod som infra.opensverige.se. Oberoende och inte statlig.

Dataset ${d.byggd} · ${s.antal} organisationer · ${s.med_bekraftat} med minst ett bekräftat fält · senast verifierad ${s.senast_verifierad ?? 'okänt'}

## Så citerar du
Citera alltid status och datum tillsammans med värdet: "egen uppgift" är inte "bekräftad". Format: OpenSverige AI-kartan, "<organisation>", <fält>: <värde> (<status>, kontrollerad <datum>), ${absolutUrl('/organisation/<id>')}#falt-<fält>. Data: CC BY 4.0.

## Maskinläsbart
- Hela datasetet (JSON, alla fält med källa och status): ${absolutUrl('/api/data.json')}
- En organisation: ${absolutUrl('/api/data/{id}.json')}
- CSV: ${absolutUrl('/api/data.csv')}
- GeoJSON (positioner på kommunnivå): ${absolutUrl('/api/data.geojson')}
- Ändringshistorik (varje ändrat fält med datum): ${absolutUrl('/api/andringar.json')}
- Status och färskhet: ${absolutUrl('/api/status.json')}
- Fulltext för svarsmotorer: ${absolutUrl('/llms-full.txt')}
- Atom-flöde över ändringar: ${absolutUrl('/feed.xml')}
- JSON Schema: ${SAJT.repo}/blob/main/schema/organisation.schema.json
- Kod och data: ${SAJT.repo}

## Sidor
- Karta med filter: ${absolutUrl('/')}
- Alla organisationer: ${absolutUrl('/organisationer')}
- Platser (kommuner och län): ${absolutUrl('/plats')}
- Metod och status: ${absolutUrl('/metod')}
- Kriterier för att vara med: ${absolutUrl('/kriterier')}
- Bidra: ${absolutUrl('/bidra')}
- Ändringshistorik: ${absolutUrl('/andringar')}
- Varför kartan finns: ${absolutUrl('/om')}

## Begränsningar
- Kartan visar vad som finns, inte vad som är bäst. Den ger inga rekommendationer.
- Positioner är kommunens mittpunkt, aldrig en gatuadress.
- Enskilda firmor tas inte emot än. Inga finns på kartan.
- "Okänd" betyder inte undersökt, inte nej.
`;
  return new Response(text, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
};
