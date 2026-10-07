// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import vercel from '@astrojs/vercel';
import fs from 'node:fs';

// Sajten är helt statisk. Allt byggs från data/organisationer/*.yaml.
// SITE kan skrivas över vid bygge (t.ex. för förhandsvisning på GitHub Pages).
const site = process.env.SITE_URL || 'https://karta.opensverige.se';
const base = process.env.BASE_PATH || '/';

// Senaste ändring per organisation, läst ur datafilerna. Sitemappen säger då när varje sida
// faktiskt ändrades, i stället för att alla sidor får byggdagen.
const datakatalog = new URL('./data/organisationer/', import.meta.url);
const andrad = new Map(
  fs
    .readdirSync(datakatalog)
    .filter((fil) => fil.endsWith('.yaml'))
    .map((fil) => [fil.replace(/\.yaml$/, ''), fs.readFileSync(new URL(fil, datakatalog), 'utf8').match(/^record_updated_at:\s*["']?(\d{4}-\d{2}-\d{2})/m)?.[1]]),
);
const senastAndrad = [...andrad.values()].filter(Boolean).sort().at(-1);
// Sidor som byggs ur datan och därför ändras när datan gör det. Textsidorna får inget datum.
const DATASIDA = /^https?:\/\/[^/]+\/(organisationer|plats|lan|andringar|data)?(\/|$)/;

export default defineConfig({
  site,
  base,
  output: 'static',
  adapter: vercel({
    webAnalytics: {
      enabled: true,
    },
  }),
  trailingSlash: 'ignore',
  compressHTML: true,
  build: {
    format: 'directory',
    inlineStylesheets: 'auto',
  },
  i18n: {
    defaultLocale: 'sv',
    locales: ['sv', 'en'],
    routing: { prefixDefaultLocale: false },
  },
  integrations: [
    sitemap({
      filter: (page) => !page.includes('/api/'),
      serialize(item) {
        const id = item.url.match(/\/organisation\/([^/]+)\/?$/)?.[1];
        const datum = id ? andrad.get(id) : DATASIDA.test(item.url) ? senastAndrad : undefined;
        return datum ? { ...item, lastmod: new Date(datum).toISOString() } : item;
      },
    }),
  ],
  vite: {
    // MapLibre är ett stort paket; det laddas bara på kartsidorna.
    build: { chunkSizeWarningLimit: 1000 },
  },
});
