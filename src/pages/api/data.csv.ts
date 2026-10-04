import type { APIRoute } from 'astro';
import { hamtaData, absolutUrl } from '../../lib/data';
import type { Fakta } from '../../lib/data';

function cell(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = Array.isArray(v) ? v.join('|') : typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const GET: APIRoute = () => {
  const d = hamtaData();
  const faktafalt = ['name', 'legal_name', 'type', 'org_number', 'description', 'offers', 'areas', 'kommun', 'founded', 'active'] as const;
  const rubriker = ['id', 'url', 'website'];
  for (const f of faktafalt) rubriker.push(f, `${f}_status`, `${f}_source_url`, `${f}_verified_at`);
  rubriker.push('kommun_namn', 'lan_kod', 'lan_namn', 'lat', 'lng', 'position_typ', 'evidence_urls', 'github', 'huggingface', 'linkedin', 'infra_id', 'self_submitted', 'record_created_at', 'record_updated_at', 'senast_verifierad', 'antal_bekraftade', 'antal_fakta');

  const rader = [rubriker.join(',')];
  for (const o of d.organisationer) {
    const rad: unknown[] = [o.id, absolutUrl(`/organisation/${o.id}`), o.website];
    for (const f of faktafalt) {
      const fakta = o[f] as Fakta | undefined;
      rad.push(fakta?.value ?? null, fakta?.status ?? null, fakta?.source_url ?? null, fakta?.verified_at ?? null);
    }
    rad.push(
      o.h.kommun_namn, o.h.lan_kod, o.h.lan_namn, o.h.position?.lat ?? null, o.h.position?.lng ?? null, o.h.position_typ,
      o.evidence.map((b) => b.url), o.links?.github ?? null, o.links?.huggingface ?? null, o.links?.linkedin ?? null, o.links?.infra_id ?? null,
      o.self_submitted ?? false, o.record_created_at, o.record_updated_at, o.h.senast_verifierad, o.h.antal_bekraftade, o.h.antal_fakta,
    );
    rader.push(rad.map(cell).join(','));
  }
  return new Response(rader.join('\r\n') + '\r\n', {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="ai-kartan-${d.byggd}.csv"`,
    },
  });
};
