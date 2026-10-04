import type { APIRoute } from 'astro';
import { hamtaData, absolutUrl, SAJT } from '../lib/data';

const esc = (s: unknown) => String(s ?? '').replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' })[c]!);

export const GET: APIRoute = () => {
  const d = hamtaData();
  const perDag = new Map<string, typeof d.andringar.rader>();
  for (const r of d.andringar.rader) {
    if (!perDag.has(r.datum)) perDag.set(r.datum, []);
    perDag.get(r.datum)!.push(r);
  }
  const dagar = [...perDag.keys()].sort().reverse().slice(0, 60);
  const uppdaterad = dagar[0] ? `${dagar[0]}T12:00:00Z` : `${d.byggd}T00:00:00Z`;
  const poster = dagar
    .map((dag) => {
      const rader = perDag.get(dag)!;
      const lista = rader
        .slice(0, 200)
        .map((r) => `<li><a href="${esc(absolutUrl(`/organisation/${r.id}`))}">${esc(r.namn)}</a>: ${esc(r.falt)} ${esc(r.andring)}${r.nytt !== null && r.nytt !== undefined && r.falt !== 'hela posten' ? ` → ${esc(typeof r.nytt === 'object' ? JSON.stringify(r.nytt) : r.nytt)}` : ''}</li>`)
        .join('');
      return `<entry>
  <title>${esc(`Ändringar ${dag}: ${rader.length} ${rader.length === 1 ? 'uppgift' : 'uppgifter'}`)}</title>
  <id>${esc(absolutUrl(`/andringar#${dag}`))}</id>
  <link href="${esc(absolutUrl(`/andringar#${dag}`))}"/>
  <updated>${dag}T12:00:00Z</updated>
  <content type="html">${esc(`<ul>${lista}</ul>`)}</content>
</entry>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Ändringar på OpenSverige AI-kartan</title>
  <subtitle>Varje ändrat fält i datan, med datum. CC BY 4.0.</subtitle>
  <id>${esc(absolutUrl('/'))}</id>
  <link href="${esc(absolutUrl('/feed.xml'))}" rel="self"/>
  <link href="${esc(absolutUrl('/andringar'))}"/>
  <updated>${uppdaterad}</updated>
  <author><name>OpenSverige</name><uri>${esc(SAJT.opensverige)}</uri></author>
  <rights>CC BY 4.0</rights>
${poster}
</feed>
`;
  return new Response(xml, { headers: { 'content-type': 'application/atom+xml; charset=utf-8' } });
};
