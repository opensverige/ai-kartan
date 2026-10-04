// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// Sajten är helt statisk. Allt byggs från data/organisationer/*.yaml.
// SITE kan skrivas över vid bygge (t.ex. för förhandsvisning på GitHub Pages).
const site = process.env.SITE_URL || 'https://karta.opensverige.se';
const base = process.env.BASE_PATH || '/';

export default defineConfig({
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
    }),
  ],
  vite: {
    // MapLibre är ett stort paket; det laddas bara på kartsidorna.
    build: { chunkSizeWarningLimit: 1000 },
  },
});
