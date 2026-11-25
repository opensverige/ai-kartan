// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
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

// Content Security Policy. Astro räknar hashar för de inline-skript och inline-stilar som byggs
// in och skriver policyn som en meta-tagg i varje sida. Allt annat än sajten själv nekas, utom
// det kartan hämtar: baskartans stil, tiles och glyfer från OpenFreeMap, och pixelstädernas
// bilder från bildtjänsten när PUBLIC_PIXELKARTA_URL är satt vid bygget.
// Stilattribut: kortens och detaljvyns färg sätts som style-attribut (--f) i HTML som byggs i
// webbläsaren. Attribut går inte att hasha, så de tillåts (style-src-attr); stilelementen har hashar.
const pixelkarta = process.env.PUBLIC_PIXELKARTA_URL ? new URL(process.env.PUBLIC_PIXELKARTA_URL).origin : '';
// Pixelbyggets rutnät (/pixelbygget) läses från rut-tjänsten. Samma adress som i src/pages/pixelbygget.astro.
const pixelbygget = new URL(process.env.PUBLIC_PIXELBYGGET_URL || 'https://pixelbygget.gustaf-garnow.workers.dev').origin;
const kallor = (...v) => v.filter(Boolean).join(' ');
const CSP = [
  "default-src 'self'",
  `img-src ${kallor("'self'", 'data:', pixelkarta)}`,
  `connect-src ${kallor("'self'", 'https://tiles.openfreemap.org', pixelkarta, pixelbygget, 'https://nominatim.openstreetmap.org')}`,
  "worker-src 'self'",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-src 'none'",
];

export default defineConfig({
  security: {
    csp: {
      directives: CSP,
      scriptDirective: { resources: ["'self'"] },
      styleDirective: { resources: ["'self'", { resource: "'unsafe-inline'", kind: 'attribute' }] },
    },
  },
  site,
  base,
  output: 'static',
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
        // Sidorna nås utan avslutande snedstreck, och det är den adressen som står i canonical.
        // Med snedstreck svarar varje adress i sitemappen med en vidarepekning.
        const adress = item.url.replace(/^(https?:\/\/[^/]+\/.+?)\/+$/, '$1');
        return { ...item, url: adress, ...(datum ? { lastmod: new Date(datum).toISOString() } : {}) };
      },
    }),
  ],
  vite: {
    // MapLibre är ett stort paket; det laddas bara på kartsidorna.
    build: { chunkSizeWarningLimit: 1000 },
  },
});
