// Pixelkartans geometri: var en plats på marken hamnar i en stads kartbild, hur nära den platta
// kartan är en stad, och hur mycket den ska luta där.
//
// En pixelkarta är marken sedd snett uppifrån, 45 grader, utan perspektiv. Den platta kartan
// visar marken på samma sätt när den lutar 45 grader och har ett mycket smalt synfält. Med samma
// mitt och skala ligger de två då över varandra, och pixelstaden kan visas genom en glugg i den
// platta kartan. Därför lutar sig den platta kartan lite för varje zoomsteg när en stad kommer
// nära, tills den ligger i pixelkartans vinkel.

/** En stads kartbild, som den står i kartfilen (karta.json hos bildtjänsten). */
export interface Kartblad {
  id: string;
  /** Beskrivningen av bildrutorna, relativt kartfilen. */
  dzi: string;
  /** Riktningen uppåt i bilden, grader medurs från norr. */
  heading: number;
  origin: { lat: number; lon: number };
  /** Bildens övre vänstra hörn, i meter från origin längs bildens axlar. */
  xMeters: number;
  yMeters: number;
  /** Markens höjd över ellipsoiden, i meter. */
  groundHeight: number;
  /** Bildens storlek i bildpunkter. */
  width: number;
  height: number;
  /** Hela kartan som en liten bild, och stadens kant (alfa), relativt kartfilen. */
  island: string;
  edge: string;
}

/** Ett hus i kartbilden: dess form som bild (alfa) och var den ligger, i kartbildens punkter. */
export interface Livsnat {
  file: string;
  edges: number;
  samples: number;
  nodes: number;
  stepMeters: number;
  /** Bildpunkter i kartbilden per steg i filens koordinater. */
  unit: number;
}
/** Näten hos bildtjänsten som det som rör sig i en stad går på. Allt är valfritt: det som saknas rör sig inte. */
export interface Livsfiler {
  roads?: Livsnat;
  rails?: Livsnat;
  ferries?: Livsnat;
  /** Öppet vatten som bild, 1/64 av kartbildens storlek: vitt där det är vatten. */
  water?: string;
}

export interface Hus {
  picture: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Stad {
  id: string;
  label: string;
  map: Kartblad;
  /** Organisationer utan exakt adress: deras plats i vattnet, i kartbildens punkter. */
  water?: Record<string, [number, number]>;
  /** Organisationer med adress: huset de sitter i. */
  addresses?: Record<string, string>;
  houses?: Record<string, Hus>;
  /** Det som rör sig i staden går på: vägar, spår, färjelinjer och öppet vatten. */
  life?: Livsfiler;
}

export interface Kartfil {
  version: number;
  metersPerPixel: number;
  cities: Stad[];
}

export interface Projektion {
  /** Platsen på marken som bildpunkt i kartbilden. */
  tillBild(lat: number, lon: number): { x: number; y: number };
  /** Bildpunkten som plats på marken. */
  tillMark(x: number, y: number): { lat: number; lon: number };
}

/** Pixelkartans vinkel mot marken, i grader. */
export const VINKEL = 45;
/** Den platta kartans synfält när den ska ligga över pixelkartan, i grader. */
export const SYNFALT = 1;
/** Lutningen börjar när staden är så här långt bort, räknat i "hela staden i bild". */
export const LUTA_FRAN = 10;
/** Från hit och inåt ligger kartan i pixelkartans vinkel. */
export const LUTA_HELT = 1.6;
/** Gluggen mot pixelstaden är helt öppen från hit och inåt. */
export const GLUGG_HELT = 1.25;
/** Hur långt åt sidan staden räknas fullt, i rutans mått: långt ute, och nära (från LUTA_HELT och inåt). */
const SIDA_UTE = 0.04;
const SIDA_NARA = 0.5;
/** Marginalen åt sidan börjar växa härifrån och inåt. */
const SIDA_FRAN = 4;

const A = 6378137.0;
const F = 1 / 298.257223563;
const E2 = F * (2 - F);
const JORDENS_OMKRETS = 2 * Math.PI * A;
type V3 = [number, number, number];

const rad = (v: number): number => (v * Math.PI) / 180;
const skalar = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function summa(delar: [V3, number][]): V3 {
  const ut: V3 = [0, 0, 0];
  for (const [v, k] of delar) for (let i = 0; i < 3; i += 1) ut[i] += v[i] * k;
  return ut;
}

function tillEcef(lat: number, lon: number, hojd: number): V3 {
  const la = rad(lat);
  const lo = rad(lon);
  const n = A / Math.sqrt(1 - E2 * Math.sin(la) ** 2);
  return [(n + hojd) * Math.cos(la) * Math.cos(lo), (n + hojd) * Math.cos(la) * Math.sin(lo), (n * (1 - E2) + hojd) * Math.sin(la)];
}

function tillGeodetisk(p: V3): { lat: number; lon: number; hojd: number } {
  const b = A * (1 - F);
  const ep2 = (A * A - b * b) / (b * b);
  const r = Math.hypot(p[0], p[1]);
  const theta = Math.atan2(A * p[2], b * r);
  const lat = Math.atan2(p[2] + ep2 * b * Math.sin(theta) ** 3, r - E2 * A * Math.cos(theta) ** 3);
  const n = A / Math.sqrt(1 - E2 * Math.sin(lat) ** 2);
  return { lat: (lat * 180) / Math.PI, lon: (Math.atan2(p[1], p[0]) * 180) / Math.PI, hojd: r / Math.cos(lat) - n };
}

/**
 * Projektionen för en stads kartbild. Bilden är ritad i ett plan som tangerar jorden i origin:
 * åt höger i bilden är vinkelrätt mot riktningen, och uppåt i bilden är riktningen framåt och
 * höjden, lika mycket av varje (45 grader).
 */
export function skapaProjektion(blad: Kartblad, meterPerBildpunkt: number): Projektion {
  const la = rad(blad.origin.lat);
  const lo = rad(blad.origin.lon);
  const ost: V3 = [-Math.sin(lo), Math.cos(lo), 0];
  const norr: V3 = [-Math.sin(la) * Math.cos(lo), -Math.sin(la) * Math.sin(lo), Math.cos(la)];
  const upp: V3 = [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
  const riktning = rad(blad.heading);
  const hoger = summa([[ost, Math.cos(riktning)], [norr, -Math.sin(riktning)]]);
  const fram = summa([[ost, Math.sin(riktning)], [norr, Math.cos(riktning)]]);
  const origo = tillEcef(blad.origin.lat, blad.origin.lon, 0);
  return {
    tillBild(lat, lon) {
      const p = tillEcef(lat, lon, blad.groundHeight);
      const d: V3 = [p[0] - origo[0], p[1] - origo[1], p[2] - origo[2]];
      return {
        x: (skalar(d, hoger) - blad.xMeters) / meterPerBildpunkt,
        y: (blad.yMeters - (skalar(d, fram) + skalar(d, upp)) / Math.SQRT2) / meterPerBildpunkt,
      };
    },
    tillMark(x, y) {
      const mx = blad.xMeters + x * meterPerBildpunkt;
      const my = blad.yMeters - y * meterPerBildpunkt;
      // Höjden över tangentplanet som ger rätt höjd över ellipsoiden hittas på några varv.
      let lyft = blad.groundHeight;
      let mark = { lat: blad.origin.lat, lon: blad.origin.lon, hojd: 0 };
      for (let varv = 0; varv < 4; varv += 1) {
        mark = tillGeodetisk(summa([[origo, 1], [hoger, mx], [fram, my * Math.SQRT2 - lyft], [upp, lyft]]));
        lyft += blad.groundHeight - mark.hojd;
      }
      return { lat: mark.lat, lon: mark.lon };
    },
  };
}

/** Meter per skärmpunkt på den platta kartan (kartbibliotekets zoom, rutor om 512 punkter). */
export function meterPerPunkt(lat: number, zoom: number): number {
  return (JORDENS_OMKRETS * Math.cos(rad(lat))) / (512 * 2 ** zoom);
}

/** Zoomen som ger så många meter per skärmpunkt. */
export function zoomVid(lat: number, meter: number): number {
  return Math.log2((JORDENS_OMKRETS * Math.cos(rad(lat))) / (512 * meter));
}

/** Mjuk övergång från 0 till 1. */
export function mjukt(t: number): number {
  const u = Math.min(1, Math.max(0, t));
  return u * u * (3 - 2 * u);
}

/** Meter per skärmpunkt när hela stadens kartbild ryms i rutan. */
export function hemskala(blad: Kartblad, meterPerBildpunkt: number, ruta: { bredd: number; hojd: number }): number {
  return Math.max(blad.width / ruta.bredd, blad.height / ruta.hojd) * meterPerBildpunkt;
}

export interface Narhet {
  /**
   * 1 när staden räknas fullt, 0 när den inte räknas alls. Långt ute räknas den bara med
   * rutans mitt över kartbilden. Nära räknas den så länge någon del av kartbilden är i rutan,
   * så att kartan inte lägger sig ner med staden kvar i bild.
   */
  ibild: number;
  /** Skalan mätt i "hela staden i bild": 1 när kartbilden fyller rutan, större längre ut. */
  avstand: number;
}

/** Hur nära en stad den platta kartan är, mätt på skärmen. */
export function narhet(
  blad: Kartblad,
  projektion: Projektion,
  meterPerBildpunkt: number,
  ruta: { bredd: number; hojd: number },
  vy: { lat: number; lng: number; zoom: number },
): Narhet {
  const meter = meterPerPunkt(vy.lat, vy.zoom);
  const p = projektion.tillBild(vy.lat, vy.lng);
  const k = meterPerBildpunkt / meter; // bildpunkter till skärmpunkter
  // Hur långt utanför kartbilden rutans mitt ligger, i rutans egna mått: vid 0,5 ligger kartbildens kant i rutans kant.
  const dx = (Math.max(0, -p.x, p.x - blad.width) * k) / ruta.bredd;
  const dy = (Math.max(0, -p.y, p.y - blad.height) * k) / ruta.hojd;
  const avstand = meter / hemskala(blad, meterPerBildpunkt, ruta);
  const marginal = SIDA_UTE + (SIDA_NARA - SIDA_UTE) * mjukt(Math.log2(SIDA_FRAN / avstand) / Math.log2(SIDA_FRAN / LUTA_HELT));
  return { ibild: 1 - (Math.max(dx, dy) - marginal) / 0.5, avstand };
}

/**
 * Den platta kartans lutning för en närhet, i grader: 0 långt ute och utan stad i bild,
 * pixelkartans vinkel från LUTA_HELT och inåt.
 */
export function lutning(n: Narhet): number {
  const nara = Math.log2(LUTA_FRAN / n.avstand) / Math.log2(LUTA_FRAN / LUTA_HELT);
  return VINKEL * mjukt(n.ibild) * mjukt(nara);
}

/**
 * Hur öppen gluggen mot pixelstaden är, 0 till 1. Den öppnas först när kartan ligger i
 * pixelkartans vinkel, och är helt öppen från GLUGG_HELT och inåt.
 */
export function glugg(n: Narhet): number {
  const nara = Math.log2(LUTA_HELT / n.avstand) / Math.log2(LUTA_HELT / GLUGG_HELT);
  return mjukt(n.ibild) >= 1 ? mjukt(nara) : 0;
}

/** Om en bildpunkt ligger i kartbilden. */
export function iBild(blad: Kartblad, p: { x: number; y: number }): boolean {
  return p.x >= 0 && p.y >= 0 && p.x <= blad.width && p.y <= blad.height;
}
