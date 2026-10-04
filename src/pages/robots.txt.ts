import type { APIRoute } from 'astro';
import { absolutUrl } from '../lib/data';

export const GET: APIRoute = () => {
  const text = `User-agent: *
Allow: /

Sitemap: ${absolutUrl('/sitemap-index.xml')}
`;
  return new Response(text, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
};
