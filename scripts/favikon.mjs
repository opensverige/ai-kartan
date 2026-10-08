#!/usr/bin/env node
// Ritar sajtens favikon och skriver alla dess filer till public/.
//
// Ikonen är kartnålen ur sajtens bild, ritad pixel för pixel på ett rutnät om 16 × 16. Det är den
// minsta storlek en flik visar, och där ska varje pixel vara vald för hand. Större storlekar är
// samma rutnät uppförstorat utan utjämning, så att kanterna förblir skarpa.
//
//   node scripts/favikon.mjs            skriver filerna i public/
//   node scripts/favikon.mjs --prov m   skriver ett provark till mappen m i stället
//
// Inga beroenden: PNG och ICO skrivs för hand med Nodes egen zlib.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const FARG = {
  '.': null,
  K: [23, 19, 12], // kontur
  R: [213, 56, 46], // nålens röda
  D: [159, 36, 29], // skugga
  H: [242, 106, 94], // dagsljus
  N: [226, 226, 220], // nålens spets
  G: [222, 176, 0], // nålens skugga på det gula
};
const GUL = [255, 214, 10];

// Nålen står nedstucken i det gula, med huvudet uppåt och en skugga där spetsen går i. Liggande, som
// i sajtens bild, läses den som ett H i den här storleken. Stående läses den som en kartnål.
const NAL = [
  '................',
  '.....KKKKKK.....',
  '....KHHRRRRK....',
  '...KHHRRRRRDK...',
  '...KHRRRRRDDK...',
  '....KKRRRDKK....',
  '.....KHRRDK.....',
  '.....KHRRDK.....',
  '..KKKKHRRDKKKK..',
  '..KHHRRRRRRDDK..',
  '..KRRRRRRDDDDK..',
  '...KKKKNKKKKK...',
  '.......NK.......',
  '.......NK.......',
  '....GGGNKGGG....',
  '......GGGG......',
];

const RUTOR = 16;
if (NAL.length !== RUTOR || NAL.some((rad) => rad.length !== RUTOR || [...rad].some((t) => !(t in FARG)))) throw new Error('Rutnätet ska vara 16 × 16 och bara innehålla kända tecken.');

/**
 * Ikonen som en bild i RGBA.
 *   storlek   bildens sida i pixlar
 *   ruta      hur stor varje ruta i rutnätet ritas. Mindre än storlek / 16 ger luft runt om.
 *   horn      hörnens radie i pixlar. 0 ger en fylld kvadrat, för system som rundar själva.
 */
function rita(storlek, { ruta = storlek / RUTOR, horn = 0 } = {}) {
  const bild = Buffer.alloc(storlek * storlek * 4);
  const kant = (storlek - ruta * RUTOR) / 2;
  for (let y = 0; y < storlek; y++) {
    for (let x = 0; x < storlek; x++) {
      // Utanför det rundade hörnet är bilden genomskinlig.
      const dx = Math.max(horn - x - 0.5, x + 0.5 - (storlek - horn), 0);
      const dy = Math.max(horn - y - 0.5, y + 0.5 - (storlek - horn), 0);
      if (dx * dx + dy * dy > horn * horn) continue;
      const kol = Math.floor((x - kant) / ruta);
      const rad = Math.floor((y - kant) / ruta);
      const farg = (rad >= 0 && rad < RUTOR && kol >= 0 && kol < RUTOR ? FARG[NAL[rad][kol]] : null) ?? GUL;
      bild.set([...farg, 255], (y * storlek + x) * 4);
    }
  }
  return bild;
}

function png(bild, bredd, hojd = bredd) {
  const del = (typ, data) => {
    const kropp = Buffer.concat([Buffer.from(typ, 'ascii'), data]);
    const langd = Buffer.alloc(4);
    langd.writeUInt32BE(data.length);
    const summa = Buffer.alloc(4);
    summa.writeUInt32BE(zlib.crc32(kropp));
    return Buffer.concat([langd, kropp, summa]);
  };
  const huvud = Buffer.alloc(13);
  huvud.writeUInt32BE(bredd, 0);
  huvud.writeUInt32BE(hojd, 4);
  huvud.set([8, 6, 0, 0, 0], 8);
  // Varje rad börjar med en nolla: inget filter.
  const rader = Buffer.alloc(hojd * (bredd * 4 + 1));
  for (let y = 0; y < hojd; y++) bild.copy(rader, y * (bredd * 4 + 1) + 1, y * bredd * 4, (y + 1) * bredd * 4);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), del('IHDR', huvud), del('IDAT', zlib.deflateSync(rader, { level: 9 })), del('IEND', Buffer.alloc(0))]);
}

/** En ICO-fil med en PNG per storlek. */
function ico(storlekar) {
  const bilder = storlekar.map((s) => png(rita(s, { horn: Math.round(s * 0.19) }), s));
  const huvud = Buffer.alloc(6 + 16 * bilder.length);
  huvud.writeUInt16LE(1, 2);
  huvud.writeUInt16LE(bilder.length, 4);
  let plats = huvud.length;
  bilder.forEach((b, i) => {
    const p = 6 + 16 * i;
    huvud.set([storlekar[i] % 256, storlekar[i] % 256, 0, 0], p);
    huvud.writeUInt16LE(1, p + 4);
    huvud.writeUInt16LE(32, p + 6);
    huvud.writeUInt32LE(b.length, p + 8);
    huvud.writeUInt32LE(plats, p + 12);
    plats += b.length;
  });
  return Buffer.concat([huvud, ...bilder]);
}

/** Samma rutnät som SVG: en rektangel per sammanhängande färgremsa, med skarpa kanter. */
function svg() {
  const hex = (f) => `#${f.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  const remsor = [];
  NAL.forEach((rad, y) => {
    for (let x = 0; x < RUTOR; ) {
      const tecken = rad[x];
      let slut = x;
      while (slut < RUTOR && rad[slut] === tecken) slut++;
      if (FARG[tecken]) remsor.push(`<rect x="${x}" y="${y}" width="${slut - x}" height="1" fill="${hex(FARG[tecken])}"/>`);
      x = slut;
    }
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges"><clipPath id="h"><rect width="16" height="16" rx="3"/></clipPath><g clip-path="url(#h)"><rect width="16" height="16" fill="${hex(GUL)}"/>${remsor.join('')}</g></svg>\n`;
}

const FILER = {
  'favicon.svg': () => Buffer.from(svg()),
  'favicon.ico': () => ico([16, 32, 48]),
  'favicon-96x96.png': () => png(rita(96, { horn: 18 }), 96),
  // Telefoner rundar hörnen själva och vill ha en fylld kvadrat.
  'apple-touch-icon.png': () => png(rita(180, { ruta: 10 }), 180),
  'web-app-manifest-192x192.png': () => png(rita(192, { horn: 36 }), 192),
  'web-app-manifest-512x512.png': () => png(rita(512, { horn: 96 }), 512),
  // Maskerbar: systemet skär ut sin egen form, så motivet håller sig i mitten.
  'web-app-manifest-maskable-512x512.png': () => png(rita(512, { ruta: 22 }), 512),
};

const prov = process.argv.indexOf('--prov');
const mapp = prov >= 0 ? path.resolve(process.argv[prov + 1]) : path.join(import.meta.dirname, '..', 'public');
fs.mkdirSync(mapp, { recursive: true });
for (const [namn, skapa] of Object.entries(FILER)) fs.writeFileSync(path.join(mapp, namn), skapa());
if (prov >= 0) {
  // Provark: ikonen i de storlekar en flik och en hemskärm visar, på ljus och mörk botten.
  const [b, h] = [640, 300];
  const ark = Buffer.alloc(b * h * 4);
  const lagg = (bild, s, x0, y0) => {
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) if (bild[(y * s + x) * 4 + 3]) bild.copy(ark, ((y0 + y) * b + x0 + x) * 4, (y * s + x) * 4, (y * s + x) * 4 + 4);
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < b; x++) ark.set(x < b / 2 ? [245, 244, 240, 255] : [32, 33, 36, 255], (y * b + x) * 4);
  for (const x0 of [0, b / 2]) {
    lagg(rita(16, { horn: 3 }), 16, x0 + 20, 20);
    lagg(rita(32, { horn: 6 }), 32, x0 + 56, 20);
    lagg(rita(48, { horn: 9 }), 48, x0 + 108, 20);
    lagg(rita(192, { horn: 36 }), 192, x0 + 20, 88);
  }
  const bred = Buffer.alloc(b * 2 * h * 2 * 4);
  for (let y = 0; y < h * 2; y++) for (let x = 0; x < b * 2; x++) ark.copy(bred, (y * b * 2 + x) * 4, ((y >> 1) * b + (x >> 1)) * 4, ((y >> 1) * b + (x >> 1)) * 4 + 4);
  fs.writeFileSync(path.join(mapp, 'provark.png'), png(bred, b * 2, h * 2));
}
console.log(`${Object.keys(FILER).length} filer skrivna till ${mapp}`);
