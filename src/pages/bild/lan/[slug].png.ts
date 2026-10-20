// Länets delningsbild som PNG, 1200 × 630. Det är den som visas när en länk till länets sida delas,
// och den som en redaktion eller en lärare kan ladda ner. Bilden ritas i src/lib/delningsbild.ts.
import type { APIRoute, GetStaticPaths } from 'astro';
import sharp from 'sharp';
import { hamtaData, absolutUrl, type Plats } from '../../../lib/data';
import { delningsbildSvg, lanritning } from '../../../lib/delningsbild.ts';
import { BILDKARTA, lanunderlag } from '../../../lib/lanunderlag.ts';

export const getStaticPaths: GetStaticPaths = () => hamtaData().platser.lan.map((p) => ({ params: { slug: p.slug }, props: { plats: p } }));

export const GET: APIRoute = async ({ props }) => {
  const plats = (props as { plats: Plats }).plats;
  const u = lanunderlag(plats);
  const svg = delningsbildSvg({
    namn: plats.namn,
    n: plats.organisationer.length,
    lage: u.lage,
    adress: absolutUrl('/'),
    karta: lanritning(plats.kod, u.prickar, BILDKARTA),
  });
  const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9, palette: true }).toBuffer();
  return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png' } });
};
