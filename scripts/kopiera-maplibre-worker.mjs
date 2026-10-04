#!/usr/bin/env node
// MapLibre GL 6 laddar sin web worker som en separat modulfil bredvid huvudpaketet. Bundlern
// skriver inte ut den, så vi kopierar worker- och shared-filerna till public/vendor/maplibre/
// och pekar MapLibre dit med setWorkerUrl(). Körs automatiskt före `npm run dev` och `npm run build`.

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ROT } from './lib/organisationer.mjs';

const require = createRequire(import.meta.url);
const paket = path.dirname(require.resolve('maplibre-gl/package.json'));
const version = JSON.parse(fs.readFileSync(path.join(paket, 'package.json'), 'utf8')).version;
const mal = path.join(ROT, 'public', 'vendor', 'maplibre');
fs.mkdirSync(mal, { recursive: true });

for (const fil of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) {
  const fran = path.join(paket, 'dist', fil);
  const till = path.join(mal, fil);
  if (!fs.existsSync(fran)) {
    console.error(`Hittar inte ${fran}. Har maplibre-gl bytt filnamn?`);
    process.exit(1);
  }
  fs.copyFileSync(fran, till);
}
fs.writeFileSync(path.join(mal, 'VERSION'), `maplibre-gl ${version}\nKopierad av scripts/kopiera-maplibre-worker.mjs. Licens: BSD-3-Clause, se node_modules/maplibre-gl/LICENSE.txt.\n`);
console.log(`MapLibre-worker ${version} kopierad till public/vendor/maplibre/`);
