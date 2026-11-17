/**
 * Det som rör sig i en pixelstad: bilar, bussar och lastbilar på vägnätet, fågelflockar, tåg,
 * tunnelbana och spårvagnar på sina spår, färjor på sina linjer och småbåtar på öppet vatten.
 * Träd och vatten som rör sig ligger i liv-pixlar.ts, och det som rör sig i luften i liv-luft.ts.
 *
 * Allt ritas i kod på en duk som ligger över bildvisaren och under kartbilden, så att det syns
 * genom gluggen tillsammans med staden och sajtens prickar och namn ligger kvar överst. Platser
 * hålls i kartbildens egna punkter, så att allt följer med när kartan flyttas eller zoomas.
 *
 * Pixelkartans kamera ser 45 grader nedåt. En meter på marken är då 1 / (meter per bildpunkt)
 * bildpunkter i sidled och 1 / roten ur 2 av det uppåt i bilden, och en meter på höjden lyfter
 * en sak lika mycket. Fordon och båtar ritas som lådor och skrov i tre led: taket, och de två
 * sidor som vetter mot kameran, med ljuset från öster som i kartbilden.
 *
 * Näten av vägar, spår och färjelinjer kommer från bildtjänsten (underlag: OpenStreetMap). De är
 * stora, så vart och ett hämtas först när kartan har zoomats in så långt att det som rör sig på
 * det syns. Lagret håller också koll på sin egen takt: kommer bildrutorna långsammare än ungefär
 * 33 i sekunden under några sekunder går nivån ner (3 allt, 2 hälften av bilarna och inga träd
 * eller vatten som rör sig, 1 en fjärdedel av bilarna och varken tåg eller båtar), och efter en
 * halv minut i god takt går den upp igen, en gång. En telefon eller en liten dator börjar på 2.
 *
 * Två saker håller lagret fast vid kartan medan den dras eller zoomas:
 * - Det ritas om i kartans egen bildruta, direkt efter att bildvisaren har ritat. Ritat bara i
 *   sin egen takt låg det en bildruta efter, och bilarna såg ut att flyta med handen.
 * - Bilarna lever i ett område som är större än rutan (0,6 av dess storlek åt varje håll) och nya
 *   börjar utanför rutan, så att den som drar kartan möter trafik som redan är på väg. Bara när
 *   rutan hoppar till en ny plats ställs bilar rakt in i den, och tonas då in.
 *
 * Ett fordon ska gå att följa med blicken. Därför jämnas nätens uppgift om vad som syns (se
 * jamnaSynlighet), en bil som kommer till en återvändsgata vänder i stället för att försvinna,
 * och den som måste bort medan den syns tonas bort där den står.
 */
import type OpenSeadragon from 'openseadragon';
import type { Livsfiler, Livsnat } from './geometri';

/** Staden som är öppen i bildvisaren. */
export interface Livsstad {
  id: string;
  /** Stadens namn, som det skrivs. */
  namn: string;
  /** Kartbildens riktning i grader: 0 är norr uppåt. */
  riktning: number;
  /** Kartbildens storlek i bildpunkter. */
  bredd: number;
  hojd: number;
  filer: Livsfiler;
  /** En plats på marken som punkt i kartbilden. */
  tillBild(lat: number, lng: number): { x: number; y: number };
}

/** Var kartbilden ligger i rutan just nu. */
export interface Vy {
  /** Skärmpunkter per bildpunkt i kartbilden. */
  skala: number;
  ox: number;
  oy: number;
  /** Meter mark per skärmpunkt. */
  mpp: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
type Omrade = { x0: number; y0: number; x1: number; y1: number };

/** Ett nät, uppackat: kanter mellan korsningar, och punkter var fjärde meter längs varje kant. */
interface Nat {
  E: number;
  S: number;
  steg: number;
  start: Uint32Array;
  fran: Uint32Array;
  till: Uint32Array;
  x: Float32Array;
  y: Float32Array;
  info: Uint8Array;
  /** 1 där punkten syns i kartbilden, 0 där den ligger bakom ett hus eller under en bro. */
  syns: Uint8Array;
  /** Per kant: hur stor del av den som syns, 0 till 255. */
  synlig: Uint8Array;
  utStart: Uint32Array;
  ut: Int32Array;
  celler: Map<string, number[]>;
  stampel: Uint32Array;
  varv: number;
}

/** En del av lagret som rör sig på sitt eget sätt. */
export interface Del {
  oppna(stad: Livsstad): void;
  rensa(): void;
  steg(dt: number, vy: Vy): void;
  rita(vy: Vy, franKartan: boolean): void;
  /** Det som ligger över allt annat: det som flyger. */
  ritaOver?(vy: Vy): void;
  /** Ett tryck i rutan. Svarar med ett besked om trycket träffade något. */
  tryck?(x: number, y: number, vy: Vy): string | null;
  /** Sätter i gång delens påskägg, för prov. Svarar om det gick. */
  pask?(): boolean;
  tillstand(): Record<string, unknown>;
}
/** Det lagret lånar ut till sina delar. */
export interface Verktyg {
  visare: OpenSeadragon.Viewer;
  penna: CanvasRenderingContext2D;
  niva(): number;
  stad(): Livsstad | null;
  mpb: number;
  ruta(): { bredd: number; hojd: number; tathet: number };
  klocka(): number;
  skugga(farg: string, faktor: number): string;
  hamtaNat(sort: 'roads' | 'rails' | 'ferries', klart: (nat: Nat) => void): void;
  adress(fil: string): string;
  /** En duk till, under den här: för det som målar om kartbildens egna punkter. */
  dukUnder(): HTMLCanvasElement;
  /** Ett kort besked till besökaren. */
  sag(text: string, lange?: number): void;
}
export interface Liv {
  /** En stads kartbild har öppnats i bildvisaren. */
  oppna(stad: Livsstad): void;
  /** Rörelsen på eller av. Av står allt still och dukarna är tomma. */
  satt(pa: boolean): void;
  /** Bildvisaren har just ritat: rita lagret där kartbilden ligger nu. */
  ritaMedKartan(): void;
  /** Ett tryck i rutan. Svarar med ett besked om trycket träffade något som svarar. */
  tryck(x: number, y: number): string | null;
  /** Sätter i gång stadens påskägg, för prov. Svarar om staden har något och det gick. */
  pask(): boolean;
  tillstand(): Record<string, unknown>;
}

const ROT2 = Math.SQRT2;
const BIL_MAX_MPP = 2.4; // längre ut än så är en bil under två skärmpunkter: inga ritas
const BIL_TONING_MPP = 0.6; // de tonas ut över så mycket innan dess
const BILTAK = 2600;
const OMRADE = 0.6; // hur långt utanför rutan bilar hålls, i rutstorlekar
const CELL = 2048; // bildpunkter: näten är uppdelade i celler av den storleken
// En fågel har en storlek på kartan, som bilarna: en vinge på 1,7 m, lite över det dubbla mot en
// måsens, så att den alls syns. Den krymper och växer med kartan och är borta när en vinge är
// under en och en halv skärmpunkt.
const VINGE = 1.7;
const VINGE_MINST = 1.5;
// per vägklass: motorväg och motortrafikled, primär, sekundär, tertiär, lokalgator
// Farten är stadens, inte landsvägens: 25 till 40 km i timmen på gatorna, så att en bil går att följa.
const FART = [21, 11.5, 10.5, 9.5, 7]; // meter per sekund
const LUCKA = [38, 60, 85, 120, 210]; // meter väg per bil
const LACK = ['#f2f0ea', '#d9dde2', '#b9bec6', '#2b2e34', '#3b4048', '#8a1f1f', '#c0392b', '#1f4f8a', '#2e6da4', '#3d6b4a', '#c9a227', '#6b6f78', '#f2f0ea', '#d9dde2', '#2b2e34'];
const BILANDEL = [0, 0.25, 0.5, 1];
// Bussarna har stadens färger: röda och blå i Stockholm, blå i Göteborg, gröna och gula i Malmö.
const BUSSLACK: Record<string, string[]> = {
  stockholm: ['#c8202b', '#c8202b', '#c8202b', '#1f5fa8'],
  goteborg: ['#1f6fb5', '#1f6fb5', '#1f6fb5', '#e9edf0'],
  malmo: ['#4f9e3a', '#4f9e3a', '#4f9e3a', '#e0b62e'],
};
const SKAPLACK = ['#f2f0ea', '#f2f0ea', '#d9dde2', '#2e6da4', '#e0b62e', '#3b4048'];
const HYTTLACK = ['#c0392b', '#1f4f8a', '#f2f0ea', '#3d6b4a', '#e0b62e', '#2b2e34'];
const GLAS = '#1b2430';
const GLAS_LJUST = '#2c3a4d';
const LYKTA = '#fff1bf';
const BAKLYKTA = '#e0352b';
const SKUGGFARG = 'rgba(8,12,20,0.30)';

const mellan = (v: number, lag: number, hog: number): number => (v < lag ? lag : v > hog ? hog : v);

function skuggad(hex: string, faktor: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = mellan(Math.round(((n >> 16) & 255) * faktor), 0, 255);
  const g = mellan(Math.round(((n >> 8) & 255) * faktor), 0, 255);
  const b = mellan(Math.round((n & 255) * faktor), 0, 255);
  return `rgb(${r},${g},${b})`;
}

/* ---------- ritning i tre led ---------- */

// Saken som ritas just nu: var dess mitt står på skärmen, åt vilket håll den pekar på marken
// (dr åt bildens höger, df bort från kameran), hur många skärmpunkter en meter är, hur högt över
// marken dess botten ligger och hur mycket den lutar åt sidan. Det sätts med stallRit(). Sedan
// ges alla mått i meter från sakens mitt: framåt, åt höger och uppåt.
let RX = 0;
let RY = 0;
let RDR = 1;
let RDF = 0;
let RK = 1;
let RUPP = 0;
let RLUT = 0;

export function stallRit(x: number, y: number, dr: number, df: number, k: number, upp = 0, lut = 0) {
  RX = x;
  RY = y;
  RDR = dr;
  RDF = df;
  RK = k;
  RUPP = upp;
  RLUT = lut;
}
/** Var en punkt på saken hamnar på skärmen. */
export const skX = (fram: number, hoger: number, upp = 0): number => RX + (RDR * fram + RDF * (hoger + upp * RLUT)) * RK;
export const skY = (fram: number, hoger: number, upp = 0): number => RY + ((-RDF * fram + RDR * (hoger + upp * RLUT) - upp - RUPP) * RK) / ROT2;

type Penna = CanvasRenderingContext2D;

/** En yta med fyra hörn. */
export function fyrkant(p: Penna, f0: number, h0: number, u0: number, f1: number, h1: number, u1: number, f2: number, h2: number, u2: number, f3: number, h3: number, u3: number, farg: string) {
  p.fillStyle = farg;
  p.beginPath();
  p.moveTo(skX(f0, h0, u0), skY(f0, h0, u0));
  p.lineTo(skX(f1, h1, u1), skY(f1, h1, u1));
  p.lineTo(skX(f2, h2, u2), skY(f2, h2, u2));
  p.lineTo(skX(f3, h3, u3), skY(f3, h3, u3));
  p.closePath();
  p.fill();
}

/** En yta med tre hörn: ett segel, en vimpel. */
export function trekant(p: Penna, f0: number, h0: number, u0: number, f1: number, h1: number, u1: number, f2: number, h2: number, u2: number, farg: string) {
  p.fillStyle = farg;
  p.beginPath();
  p.moveTo(skX(f0, h0, u0), skY(f0, h0, u0));
  p.lineTo(skX(f1, h1, u1), skY(f1, h1, u1));
  p.lineTo(skX(f2, h2, u2), skY(f2, h2, u2));
  p.closePath();
  p.fill();
}

/** Ett streck mellan två punkter: en mast, en lina. */
export function streck(p: Penna, f0: number, h0: number, u0: number, f1: number, h1: number, u1: number, farg: string, tjocklek: number) {
  p.strokeStyle = farg;
  p.lineWidth = tjocklek;
  p.lineCap = 'butt';
  p.beginPath();
  p.moveTo(skX(f0, h0, u0), skY(f0, h0, u0));
  p.lineTo(skX(f1, h1, u1), skY(f1, h1, u1));
  p.stroke();
}

/**
 * En låda: från f0 till f1 framåt, h0 till h1 åt höger och u0 till u1 uppåt. De två sidor som
 * vetter mot kameran ritas, och sedan taket. Sidan som vetter åt öster är i ljus, den andra i skugga.
 */
export function lada3(p: Penna, f0: number, f1: number, h0: number, h1: number, u0: number, u1: number, tak: string, ljus: string, mork: string) {
  if (RDR > 0.03) fyrkant(p, f0, h1, u0, f1, h1, u0, f1, h1, u1, f0, h1, u1, RDF > 0 ? ljus : mork);
  else if (RDR < -0.03) fyrkant(p, f0, h0, u0, f1, h0, u0, f1, h0, u1, f0, h0, u1, RDF < 0 ? ljus : mork);
  if (RDF < -0.03) fyrkant(p, f1, h0, u0, f1, h1, u0, f1, h1, u1, f1, h0, u1, RDR > 0 ? ljus : mork);
  else if (RDF > 0.03) fyrkant(p, f0, h0, u0, f0, h1, u0, f0, h1, u1, f0, h0, u1, RDR < 0 ? ljus : mork);
  fyrkant(p, f0, h0, u1, f1, h0, u1, f1, h1, u1, f0, h1, u1, tak);
}

/** Ett band längs den långsida som syns: en fönsterrad, en rand. `b` är halva bredden. */
export function langband(p: Penna, f0: number, f1: number, b: number, u0: number, u1: number, farg: string) {
  if (RDR > -0.03 && RDR < 0.03) return;
  const h = RDR > 0 ? b : -b;
  fyrkant(p, f0, h, u0, f1, h, u0, f1, h, u1, f0, h, u1, farg);
}

/** Ett band på en kortsida, om den syns: en vindruta, en lykta. `fram` säger om sidan vetter framåt. */
export function kortband(p: Penna, f: number, fram: boolean, h0: number, h1: number, u0: number, u1: number, farg: string) {
  if (fram ? RDF > -0.03 : RDF < 0.03) return;
  fyrkant(p, f, h0, u0, f, h1, u0, f, h1, u1, f, h0, u1, farg);
}

const PX = new Float32Array(16);
const PY = new Float32Array(16);

/**
 * En form med raka sidor, som ett skrov: hörnen runt om i meter (fram, höger, fram, höger ...),
 * från u0 till u1 uppåt. Sidorna som vetter mot kameran ritas, och sedan ovansidan, med en tunn
 * kant runt om för den som ger en färg till den.
 */
export function prisma(p: Penna, horn: readonly number[], u0: number, u1: number, tak: string, ljus: string, mork: string, kant = '') {
  const n = Math.min(16, horn.length >> 1);
  let yta = 0;
  for (let i = 0; i < n; i += 1) {
    PX[i] = skX(horn[2 * i], horn[2 * i + 1], u0);
    PY[i] = skY(horn[2 * i], horn[2 * i + 1], u0);
  }
  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n;
    yta += PX[i] * PY[j] - PX[j] * PY[i];
  }
  const lx = skX(0, 0, u1) - skX(0, 0, u0);
  const ly = skY(0, 0, u1) - skY(0, 0, u0);
  const varv = yta > 0 ? 1 : -1;
  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n;
    // sidans riktning utåt: nedåt i bilden är mot kameran, åt höger är i ljus
    const ux = (PY[j] - PY[i]) * varv;
    const uy = -(PX[j] - PX[i]) * varv;
    if (uy <= 0) continue;
    p.fillStyle = ux > 0 ? ljus : mork;
    p.beginPath();
    p.moveTo(PX[i], PY[i]);
    p.lineTo(PX[j], PY[j]);
    p.lineTo(PX[j] + lx, PY[j] + ly);
    p.lineTo(PX[i] + lx, PY[i] + ly);
    p.closePath();
    p.fill();
  }
  p.fillStyle = tak;
  p.beginPath();
  for (let i = 0; i < n; i += 1) {
    if (i) p.lineTo(PX[i] + lx, PY[i] + ly);
    else p.moveTo(PX[i] + lx, PY[i] + ly);
  }
  p.closePath();
  p.fill();
  if (kant) {
    p.strokeStyle = kant;
    p.lineWidth = Math.max(0.5, 0.12 * RK);
    p.stroke();
  }
}

/** Skuggan på marken av en låda som är `hojd` meter hög: solen står i öster, så skuggan faller åt väster. */
export function skuggruta(p: Penna, f0: number, f1: number, h0: number, h1: number, hojd: number) {
  const dx = -0.5 * hojd * RK;
  const dy = 0.22 * hojd * RK;
  p.fillStyle = SKUGGFARG;
  p.beginPath();
  for (let varv = 0; varv < 2; varv += 1) {
    const ox = varv * dx;
    const oy = varv * dy;
    p.moveTo(skX(f0, h0) + ox, skY(f0, h0) + oy);
    p.lineTo(skX(f1, h0) + ox, skY(f1, h0) + oy);
    p.lineTo(skX(f1, h1) + ox, skY(f1, h1) + oy);
    p.lineTo(skX(f0, h1) + ox, skY(f0, h1) + oy);
    p.closePath();
  }
  p.fill();
}

/** Lyktor på ett fordon som är 2 F långt och 2 B brett: ljusa fram, röda bak. */
function lyktor(p: Penna, F: number, B: number, u: number) {
  kortband(p, F, true, -B + 0.1, -B + 0.5, u, u + 0.28, LYKTA);
  kortband(p, F, true, B - 0.5, B - 0.1, u, u + 0.28, LYKTA);
  kortband(p, -F, false, -B + 0.1, -B + 0.5, u, u + 0.28, BAKLYKTA);
  kortband(p, -F, false, B - 0.5, B - 0.1, u, u + 0.28, BAKLYKTA);
}

/**
 * Jämnar ut nätets uppgift om vad som syns. Underlaget säger det punkt för punkt, var fjärde
 * meter, och är prickigt: en parkerad bil, en lyktstolpe eller en trädkrona räcker för att en
 * punkt ska räknas som dold. De flesta dolda sträckor var en enda punkt långa, och en bil syntes
 * i median en sekund åt gången innan den tonades bort och kom tillbaka. Här fylls dolda luckor på
 * upp till `lucka` punkter mellan synliga, och sedan tas synliga öar på upp till `o` punkter
 * mellan dolda bort. Det som är kvar som dolt är det som är långt nog att vara ett hus eller en bro.
 */
export function jamnaSynlighet(start: Uint32Array, syns: Uint8Array, lucka: number, o: number) {
  const E = start.length - 1;
  for (let e = 0; e < E; e += 1) {
    const a = start[e];
    const b = start[e + 1];
    for (let varv = 0; varv < 2; varv += 1) {
      // varv 0 fyller dolda luckor, varv 1 tar bort synliga öar
      const letar = varv === 0 ? 0 : 1;
      const storst = varv === 0 ? lucka : o;
      let s = a;
      while (s < b) {
        if (syns[s] !== letar) {
          s += 1;
          continue;
        }
        let t = s;
        while (t < b && syns[t] === letar) t += 1;
        // mitt i kanten, eller vid dess ena ände om den är kort: korsningen hör till grannen
        const inre = s > a && t < b;
        const vidAnde = (s === a) !== (t === b) && t - s <= 2 && b - a > 4;
        if ((inre && t - s <= storst) || (varv === 0 && vidAnde)) syns.fill(1 - letar, s, t);
        s = t;
      }
    }
  }
}

/**
 * Packar upp ett nät. I filen är en punkt två steg på 16 bitar från punkten före, i delar av en
 * bildpunkt, och en bit för synlig eller dold. Ordningen: start uint32[E + 1], från uint32[E],
 * till uint32[E], x0 int32[E], y0 int32[E] (kantens första punkt), dx int16[S], dy int16[S],
 * info uint8[E], synlighet uint8[S / 8 uppåt].
 */
function lasNat(b: Livsnat, buffert: ArrayBuffer): Nat {
  const E = b.edges;
  const S = b.samples;
  const N = b.nodes;
  let vid = 0;
  const ta = <T>(Typ: { new (buf: ArrayBuffer, offset: number, antal: number): T; BYTES_PER_ELEMENT: number }, antal: number): T => {
    const vy = new Typ(buffert, vid, antal);
    vid += antal * Typ.BYTES_PER_ELEMENT;
    return vy;
  };
  const start = ta(Uint32Array, E + 1);
  const fran = ta(Uint32Array, E);
  const till = ta(Uint32Array, E);
  const x0 = ta(Int32Array, E);
  const y0 = ta(Int32Array, E);
  const dx = ta(Int16Array, S);
  const dy = ta(Int16Array, S);
  const info = ta(Uint8Array, E);
  const bitar = ta(Uint8Array, Math.ceil(S / 8));
  if (vid > buffert.byteLength) throw new Error('nätet är kortare än det säger');
  const x = new Float32Array(S);
  const y = new Float32Array(S);
  const syns = new Uint8Array(S);
  for (let e = 0; e < E; e += 1) {
    let px = x0[e];
    let py = y0[e];
    for (let s = start[e]; s < start[e + 1]; s += 1) {
      px += dx[s];
      py += dy[s];
      x[s] = px * b.unit;
      y[s] = py * b.unit;
      syns[s] = (bitar[s >> 3] >> (s & 7)) & 1;
    }
  }
  jamnaSynlighet(start, syns, 4, 2);
  const synlig = new Uint8Array(E);
  for (let e = 0; e < E; e += 1) {
    let antal = 0;
    for (let s = start[e]; s < start[e + 1]; s += 1) antal += syns[s];
    synlig[e] = Math.round((255 * antal) / Math.max(1, start[e + 1] - start[e]));
  }
  // för varje korsning, kanterna en bil kan lämna den på: e + 1 framåt, -(e + 1) bakåt
  const antal = new Uint32Array(N + 1);
  for (let e = 0; e < E; e += 1) {
    antal[fran[e] + 1] += 1;
    if (!(info[e] & 8)) antal[till[e] + 1] += 1;
  }
  for (let n = 0; n < N; n += 1) antal[n + 1] += antal[n];
  const ut = new Int32Array(antal[N]);
  const fyllt = new Uint32Array(N);
  for (let e = 0; e < E; e += 1) {
    ut[antal[fran[e]] + fyllt[fran[e]]++] = e + 1;
    if (!(info[e] & 8)) ut[antal[till[e]] + fyllt[till[e]]++] = -(e + 1);
  }
  // vilka kanter som rör vilken cell av kartbilden
  const celler = new Map<string, number[]>();
  for (let e = 0; e < E; e += 1) {
    let ax = Infinity;
    let ay = Infinity;
    let bx = -Infinity;
    let by = -Infinity;
    for (let s = start[e]; s < start[e + 1]; s += 1) {
      if (x[s] < ax) ax = x[s];
      if (x[s] > bx) bx = x[s];
      if (y[s] < ay) ay = y[s];
      if (y[s] > by) by = y[s];
    }
    for (let cy = Math.floor(ay / CELL); cy <= Math.floor(by / CELL); cy += 1) {
      for (let cx = Math.floor(ax / CELL); cx <= Math.floor(bx / CELL); cx += 1) {
        const nyckel = `${cx},${cy}`;
        let lista = celler.get(nyckel);
        if (!lista) celler.set(nyckel, (lista = []));
        lista.push(e);
      }
    }
  }
  return { E, S, steg: b.stepMeters, start, fran, till, x, y, info, syns, synlig, utStart: antal, ut, celler, stampel: new Uint32Array(E), varv: 0 };
}

/* ---------- det delarna har gemensamt ---------- */

type Urval = { kanter: number[]; summor: number[]; totalt: number };

/** Kanterna i ett nät som ligger i ett område, med en vikt var. */
function samla(nat: Nat, omrade: Omrade, vikt: (e: number, meter: number) => number): Urval {
  const ut: Urval = { kanter: [], summor: [], totalt: 0 };
  nat.varv += 1;
  for (let cy = Math.floor(omrade.y0 / CELL); cy <= Math.floor(omrade.y1 / CELL); cy += 1) {
    for (let cx = Math.floor(omrade.x0 / CELL); cx <= Math.floor(omrade.x1 / CELL); cx += 1) {
      const lista = nat.celler.get(`${cx},${cy}`);
      if (!lista) continue;
      for (const e of lista) {
        if (nat.stampel[e] === nat.varv) continue;
        nat.stampel[e] = nat.varv;
        // den del av kanten som ligger i området, räknad på varannan punkt
        let inne = 0;
        for (let s = nat.start[e]; s < nat.start[e + 1]; s += 2) {
          if (nat.x[s] >= omrade.x0 && nat.x[s] <= omrade.x1 && nat.y[s] >= omrade.y0 && nat.y[s] <= omrade.y1) inne += 2;
        }
        if (!inne) continue;
        ut.kanter.push(e);
        ut.totalt += vikt(e, inne * nat.steg);
        ut.summor.push(ut.totalt);
      }
    }
  }
  return ut;
}

/** En kant ur urvalet, vald efter sin vikt. */
function valjKant(urval: Urval): number {
  const val = Math.random() * urval.totalt;
  let lag = 0;
  let hog = urval.summor.length - 1;
  while (lag < hog) {
    const mitt = (lag + hog) >> 1;
    if (urval.summor[mitt] < val) lag = mitt + 1;
    else hog = mitt;
  }
  return urval.kanter[lag];
}

function vidgad(vy: Omrade, med: number): Omrade {
  const px = med * (vy.x1 - vy.x0);
  const py = med * (vy.y1 - vy.y0);
  return { x0: vy.x0 - px, y0: vy.y0 - py, x1: vy.x1 + px, y1: vy.y1 + py };
}

const inom = (o: Omrade, x: number, y: number): boolean => x >= o.x0 && x <= o.x1 && y >= o.y0 && y <= o.y1;

/** Åt vilket håll en linje lämnar eller kommer in i en kant, i bildpunkter med bildens hoptryckning borttagen. */
function riktningVid(nat: Nat, e: number, hall: number, iSlutet: boolean): { x: number; y: number } {
  const a = nat.start[e];
  const b = nat.start[e + 1] - 1;
  let i: number;
  let j: number;
  if (hall > 0) {
    i = iSlutet ? Math.max(a, b - 2) : a;
    j = iSlutet ? b : Math.min(b, a + 2);
  } else {
    i = iSlutet ? Math.min(b, a + 2) : b;
    j = iSlutet ? a : Math.max(a, b - 2);
  }
  return { x: nat.x[j] - nat.x[i], y: (nat.y[j] - nat.y[i]) * ROT2 };
}

/** Kanten att fortsätta på från slutet av kant e: oftast rakt fram. 0 när det inte finns någon. */
function vidare(nat: Nat, e: number, hall: number): number {
  const nod = hall > 0 ? nat.till[e] : nat.fran[e];
  const har = riktningVid(nat, e, hall, true);
  const hl = Math.hypot(har.x, har.y) || 1;
  let totalt = 0;
  const val: number[] = [];
  const summor: number[] = [];
  for (let i = nat.utStart[nod]; i < nat.utStart[nod + 1]; i += 1) {
    const ref = nat.ut[i];
    const nasta = Math.abs(ref) - 1;
    if (nasta === e) continue;
    const dar = riktningVid(nat, nasta, ref > 0 ? 1 : -1, false);
    const rakt = (har.x * dar.x + har.y * dar.y) / (hl * (Math.hypot(dar.x, dar.y) || 1));
    totalt += 0.03 + Math.max(0, rakt) ** 6;
    val.push(ref);
    summor.push(totalt);
  }
  if (!val.length) return 0;
  const dragning = Math.random() * totalt;
  let bast = 0;
  while (bast < summor.length - 1 && summor[bast] < dragning) bast += 1;
  return val[bast];
}

const FORM = new Array<number>(18).fill(0);

/** Ett skrov sett uppifrån, spetsigt i fören: hörnen runt om, för prisma(). Samma lista lämnas varje gång. */
function skrovform(L: number, B: number): number[] {
  const f = FORM;
  f[0] = -L / 2;
  f[1] = -0.4 * B;
  f[2] = -L / 2;
  f[3] = 0.4 * B;
  f[4] = -0.36 * L;
  f[5] = B / 2;
  f[6] = 0.2 * L;
  f[7] = B / 2;
  f[8] = 0.4 * L;
  f[9] = 0.3 * B;
  f[10] = L / 2;
  f[11] = 0;
  f[12] = 0.4 * L;
  f[13] = -0.3 * B;
  f[14] = 0.2 * L;
  f[15] = -B / 2;
  f[16] = -0.36 * L;
  f[17] = -B / 2;
  return f;
}

/** Det vita V som en båt i rörelse lämnar efter sig, starkast närmast aktern. */
function kolvatten(v: Verktyg, vy: Vy, x: number, y: number, dr: number, df: number, langd: number, bredd: number, rackvidd: number, styrka: number) {
  if (styrka <= 0.02) return;
  const p = v.penna;
  const k = vy.skala / v.mpb;
  // en meter framåt och en meter åt höger, på skärmen
  const ax = dr * k;
  const ay = (-df / ROT2) * k;
  const bx = df * k;
  const by = (dr / ROT2) * k;
  // aktern
  const sx = x - ax * langd * 0.45;
  const sy = y - ay * langd * 0.45;
  p.lineCap = 'round';
  // armarna i tre bitar, svagare ju längre bak
  for (let bit = 0; bit < 3; bit += 1) {
    const fran = (rackvidd * bit) / 3;
    const till = (rackvidd * (bit + 1)) / 3;
    p.strokeStyle = `rgba(235,246,250,${(0.55 * styrka * (1 - bit * 0.3)).toFixed(3)})`;
    p.lineWidth = Math.max(1, bredd * k * (0.2 - bit * 0.04));
    p.beginPath();
    for (let sida = -1; sida <= 1; sida += 2) {
      const a = bredd * 0.3 + fran * 0.28;
      const b = bredd * 0.3 + till * 0.28;
      p.moveTo(sx - ax * fran + bx * sida * a, sy - ay * fran + by * sida * a);
      p.lineTo(sx - ax * till + bx * sida * b, sy - ay * till + by * sida * b);
    }
    p.stroke();
  }
  // det upprörda vattnet precis bakom aktern
  p.strokeStyle = `rgba(235,246,250,${(0.32 * styrka).toFixed(3)})`;
  p.lineWidth = Math.max(1, bredd * k * 0.3);
  p.beginPath();
  p.moveTo(sx, sy);
  p.lineTo(sx - ax * rackvidd * 0.3, sy - ay * rackvidd * 0.3);
  p.stroke();
}

/** En liten svensk flagga på en stång i aktern, `f` meter fram om mitten och med foten `u` meter upp. */
function flagga(p: Penna, f: number, u: number, storlek: number, k: number) {
  if (storlek * k < 3) return;
  streck(p, f, 0, u, f, 0, u + storlek * 2.1, '#3a3f46', Math.max(0.6, 0.1 * k));
  const u0 = u + storlek * 1.2;
  const u1 = u + storlek * 2.1;
  fyrkant(p, f, 0, u0, f - storlek * 1.5, 0, u0, f - storlek * 1.5, 0, u1, f, 0, u1, '#1f5fa8');
  fyrkant(p, f, 0, u0 + storlek * 0.36, f - storlek * 1.5, 0, u0 + storlek * 0.36, f - storlek * 1.5, 0, u0 + storlek * 0.54, f, 0, u0 + storlek * 0.54, '#f2c230');
  fyrkant(p, f - storlek * 0.42, 0, u0, f - storlek * 0.62, 0, u0, f - storlek * 0.62, 0, u1, f - storlek * 0.42, 0, u1, '#f2c230');
}

/* ---------- tåg, tunnelbana och spårvagnar ---------- */

function tagdel(v: Verktyg): Del {
  type Sort = { fart: number; vagnar: number; vagnslangd: number; perKm: number; kropp: string; rand: string; tak: string };
  // per sorts spår: tunnelbana, järnväg, lätt spårväg, spårvagn, smalspår
  const GRUND: Sort[] = [
    { fart: 14, vagnar: 6, vagnslangd: 23, perKm: 1 / 1.7, kropp: '#2f62a8', rand: '#e9edf0', tak: '#cdd4db' },
    { fart: 17, vagnar: 6, vagnslangd: 26, perKm: 1 / 2.4, kropp: '#e6eaee', rand: '#2f4f86', tak: '#c6ccd3' },
    { fart: 10, vagnar: 3, vagnslangd: 15, perKm: 1 / 1.5, kropp: '#eef1f3', rand: '#3c6fb0', tak: '#cfd5da' },
    { fart: 8, vagnar: 3, vagnslangd: 10, perKm: 1 / 1.0, kropp: '#2f62a8', rand: '#f1f3f5', tak: '#d9dde2' },
    { fart: 12, vagnar: 4, vagnslangd: 20, perKm: 1 / 1.9, kropp: '#a33a2c', rand: '#f0e9d8', tak: '#d5d8da' },
  ];
  // Göteborgs spårvagnar är vita med blått, och Skånes pågatåg lila.
  const STADENS: Record<string, Record<number, Partial<Sort>>> = {
    goteborg: { 2: { kropp: '#f1f3f5', rand: '#1f6fb5' }, 3: { kropp: '#f1f3f5', rand: '#1f6fb5' } },
    malmo: { 1: { kropp: '#6d4196', rand: '#dfe2e6' } },
  };
  const MAX_MPP = 4.5;
  const BREDD = 3.0;
  const KOPPEL = 0.8;
  const TAK = 40;
  type Tag = { sort: Sort; vag: number[]; kant: number; slut: boolean; ute: number; h: number; fart: number };
  let SORT = GRUND;
  let nat: Nat | null = null;
  let tagen: Tag[] = [];
  let urval: Urval | null = null;
  let omrade: Omrade | null = null;
  let alder = 9;
  let mal = 0;
  let fragat = false;

  const sortAv = (n: Nat, e: number): Sort => SORT[n.info[e] & 7] ?? SORT[1];
  const langdAv = (tag: Tag): number => tag.sort.vagnar * (tag.sort.vagnslangd + KOPPEL);

  function laggTill(n: Nat, tag: Tag, e: number) {
    // en kants första punkt är korsningen som vägen redan slutar i
    for (let s = n.start[e] + (tag.vag.length ? 1 : 0); s < n.start[e + 1]; s += 1) tag.vag.push(s);
    tag.kant = e;
  }

  function nyttTag(n: Nat, vy: Vy, dolt: boolean): Tag | null {
    if (!urval || !omrade) return null;
    for (let forsok = 0; forsok < 8; forsok += 1) {
      const e = valjKant(urval);
      const tag: Tag = { sort: sortAv(n, e), vag: [], kant: e, slut: false, ute: 0, h: 0, fart: 0 };
      laggTill(n, tag, e);
      tag.h = Math.random() * (tag.vag.length - 1);
      tag.fart = tag.sort.fart * (0.9 + 0.2 * Math.random());
      const vid = tag.vag[Math.floor(tag.h)];
      if (!inom(omrade, n.x[vid], n.y[vid])) continue;
      // När tåg väl går börjar ett nytt utom synhåll. Vagnarna bakom kommer ur intet bara där
      // vägen börjar, och det är en tunnelmynning eller kartbildens kant.
      if (dolt && inom(vy, n.x[vid], n.y[vid])) continue;
      return tag;
    }
    return null;
  }

  /** En vagn: kroppen med en rand och en fönsterrad, taket med en platta, och rutor och lyktor i tågets ändar. */
  function ritaVagn(p: Penna, sort: Sort, forst: boolean, sist: boolean, enkel: boolean) {
    const F = sort.vagnslangd / 2;
    const B = BREDD / 2;
    skuggruta(p, -F, F, -B, B, 3.2);
    lada3(p, -F, F, -B, B, 0.3, 3.5, sort.tak, v.skugga(sort.kropp, 0.94), v.skugga(sort.kropp, 0.7));
    if (enkel) return;
    langband(p, -F, F, B, 1.0, 1.35, sort.rand);
    langband(p, -F + 1.0, F - 1.0, B, 1.75, 2.8, GLAS);
    if (forst) {
      kortband(p, F, true, -B + 0.25, B - 0.25, 1.7, 2.9, GLAS);
      kortband(p, F, true, -B + 0.2, -B + 0.7, 0.75, 1.05, LYKTA);
      kortband(p, F, true, B - 0.7, B - 0.2, 0.75, 1.05, LYKTA);
    }
    if (sist) {
      kortband(p, -F, false, -B + 0.25, B - 0.25, 1.7, 2.9, GLAS);
      kortband(p, -F, false, -B + 0.2, -B + 0.7, 0.75, 1.05, BAKLYKTA);
      kortband(p, -F, false, B - 0.7, B - 0.2, 0.75, 1.05, BAKLYKTA);
    }
    lada3(p, -F + 1.2, F - 1.2, -B + 0.45, B - 0.45, 3.5, 3.72, v.skugga(sort.tak, 1.07), v.skugga(sort.tak, 0.86), v.skugga(sort.tak, 0.74));
  }

  return {
    oppna(stad) {
      nat = null;
      tagen = [];
      urval = null;
      alder = 9;
      fragat = false;
      const stadens = STADENS[stad.id] ?? {};
      SORT = GRUND.map((sort, i) => ({ ...sort, ...(stadens[i] ?? {}) }));
    },
    rensa() {
      tagen = [];
    },
    steg(dt, vy) {
      if (v.niva() < 2) {
        tagen.length = 0;
        return;
      }
      if (!nat) {
        // spåren hämtas när kartan först kommer nära där tåg syns
        if (!fragat && vy.mpp <= MAX_MPP + 1.5) {
          fragat = true;
          v.hamtaNat('rails', (hamtat) => (nat = hamtat));
        }
        return;
      }
      const n = nat;
      if (vy.mpp > MAX_MPP + 0.5) {
        tagen.length = 0;
        return;
      }
      alder += dt;
      if (alder > 1.5) {
        omrade = vidgad(vy, 1.0);
        urval = samla(n, omrade, (e, meter) => (meter / 1000) * sortAv(n, e).perKm);
        mal = Math.min(TAK, Math.round(urval.totalt + 0.3));
        alder = 0;
      }
      if (!omrade) return;
      for (let i = tagen.length - 1; i >= 0; i -= 1) {
        const tag = tagen[i];
        tag.h += (tag.fart / n.steg) * dt;
        let vakt = 0;
        while (!tag.slut && tag.h > tag.vag.length - 3 && vakt < 6) {
          const nasta = vidare(n, tag.kant, 1);
          if (nasta > 0) laggTill(n, tag, nasta - 1);
          else tag.slut = true;
          vakt += 1;
        }
        let svans = tag.h - langdAv(tag) / n.steg;
        // det tåget har lämnat bakom sig släpps
        if (svans > 600) {
          tag.vag.splice(0, 400);
          tag.h -= 400;
          svans -= 400;
        }
        let borta = tag.slut && svans > tag.vag.length - 1;
        if (!borta) {
          const huvud = tag.vag[Math.floor(mellan(tag.h, 0, tag.vag.length - 1))];
          const ande = tag.vag[Math.floor(mellan(svans, 0, tag.vag.length - 1))];
          if (inom(omrade, n.x[huvud], n.y[huvud]) || inom(omrade, n.x[ande], n.y[ande])) tag.ute = 0;
          else {
            tag.ute += dt;
            if (tag.ute > 1) borta = true;
          }
        }
        if (borta) {
          tagen[i] = tagen[tagen.length - 1];
          tagen.pop();
        }
      }
      if (!urval || !urval.kanter.length) return;
      const satt = tagen.length >= 0.6 * mal;
      for (let k = Math.min(satt ? 1 : 6, mal - tagen.length); k > 0; k -= 1) {
        const nytt = nyttTag(n, vy, satt);
        if (nytt) tagen.push(nytt);
      }
    },
    rita(vy) {
      if (!nat || !tagen.length) return;
      const n = nat;
      const toning = mellan((MAX_MPP - vy.mpp) / 0.8, 0, 1);
      if (toning <= 0) return;
      const p = v.penna;
      const nara = vidgad(vy, 0.1);
      const k = vy.skala / v.mpb;
      const enkel = k < 0.6; // långt ute: bara kropp och tak
      for (const tag of tagen) {
        const sort = tag.sort;
        const sista = tag.vag.length - 1;
        // Vagnarna ritas bortifrån och hitåt, så att den som är närmast kameran hamnar överst.
        const huvud = tag.vag[Math.floor(mellan(tag.h, 0, sista))];
        const ande = tag.vag[Math.floor(mellan(tag.h - langdAv(tag) / n.steg, 0, sista))];
        const hitat = n.y[huvud] > n.y[ande];
        for (let i = 0; i < sort.vagnar; i += 1) {
          const c = hitat ? sort.vagnar - 1 - i : i;
          const q = tag.h - (c * (sort.vagnslangd + KOPPEL) + sort.vagnslangd / 2) / n.steg;
          if (q < 1 || q > sista - 1) continue; // inte ute ur tunneln än, eller redan inne
          const j = Math.floor(q);
          const andel = q - j;
          const s0 = tag.vag[j];
          const s1 = tag.vag[j + 1];
          // Hur mycket av vagnen som syns, räknat över dess längd: den tonas in och ut ur en tunnel i stället för att slå om.
          const syn = (n.syns[tag.vag[j - 1]] * (1 - andel) + n.syns[s0] + n.syns[s1] + n.syns[tag.vag[Math.min(sista, j + 2)]] * andel) / 3;
          if (syn < 0.04) continue;
          const mx = n.x[s0] + (n.x[s1] - n.x[s0]) * andel;
          const my = n.y[s0] + (n.y[s1] - n.y[s0]) * andel;
          if (!inom(nara, mx, my)) continue;
          // vagnen pekar längs spåret en bit bakom och framför sin mitt
          const sa = tag.vag[Math.max(0, j - 2)];
          const sb = tag.vag[Math.min(sista, j + 3)];
          let dr = n.x[sb] - n.x[sa];
          let df = -(n.y[sb] - n.y[sa]) * ROT2;
          const dl = Math.hypot(dr, df);
          if (dl < 1e-6) continue;
          dr /= dl;
          df /= dl;
          p.globalAlpha = toning * syn;
          stallRit(vy.ox + mx * vy.skala, vy.oy + my * vy.skala, dr, df, k);
          ritaVagn(p, sort, c === 0, c === sort.vagnar - 1, enkel);
        }
      }
      p.globalAlpha = 1;
    },
    tillstand: () => ({ tag: tagen.length, tagmal: mal, spar: nat ? nat.E : 0 }),
  };
}

/* ---------- färjor ---------- */

function farjedel(v: Verktyg): Del {
  type Sort = { stor: boolean; fart: number; langd: number; bredd: number; perKm: number };
  // en pendelbåt, och ett fartyg till Finland eller Baltikum
  const SORT: Sort[] = [
    { stor: false, fart: 5, langd: 30, bredd: 8, perKm: 1 / 5 },
    { stor: true, fart: 7.5, langd: 185, bredd: 29, perKm: 1 / 14 },
  ];
  // de stora fartygens färger: skrovet, och skorstenen
  const REDERI: [string, string][] = [
    ['#f1f1ee', '#b3261e'],
    ['#b3261e', '#f1f1ee'],
    ['#1d3a6b', '#e0b62e'],
    ['#f1f1ee', '#1d3a6b'],
  ];
  const VITT = '#fbfaf6';
  const VITT_SKUGGA = '#d6dade';
  const KANT = 'rgba(16,28,48,0.55)';
  const MAX_MPP = 3.6;
  // Färjelinjerna löper samman vid kajerna i innerstaden. Med en färja på var och en blev vattnet
  // där fullt av båtar och kölvatten. Därför få färjor, och ingen ny nära en som redan går.
  const TAK = 8;
  const AVSTAND = 350; // meter mellan en ny färja och de som redan går
  type Farja = { e: number; hall: number; s: number; sort: Sort; fart: number; kaj: number; ute: number; rederi: number };
  let nat: Nat | null = null;
  let farjor: Farja[] = [];
  let urval: Urval | null = null;
  let omrade: Omrade | null = null;
  let alder = 9;
  let mal = 0;
  let fragat = false;

  const sortAv = (n: Nat, e: number): Sort => SORT[n.info[e] & 7] ?? SORT[0];

  function nyFarja(n: Nat, vy: Vy, dold: boolean): Farja | null {
    if (!urval || !omrade) return null;
    for (let forsok = 0; forsok < 8; forsok += 1) {
      const e = valjKant(urval);
      const langd = n.start[e + 1] - n.start[e];
      const s = Math.random() * (langd - 1);
      const vid = n.start[e] + Math.round(s);
      if (!n.syns[vid] || !inom(omrade, n.x[vid], n.y[vid])) continue;
      if (dold && inom(vy, n.x[vid], n.y[vid])) continue;
      const nara = farjor.some((f) => {
        const hos = n.start[f.e] + Math.round(mellan(f.s, 0, n.start[f.e + 1] - n.start[f.e] - 1));
        return Math.hypot(n.x[hos] - n.x[vid], (n.y[hos] - n.y[vid]) * ROT2) * v.mpb < AVSTAND;
      });
      if (nara) continue;
      const sort = sortAv(n, e);
      return { e, hall: Math.random() < 0.5 ? 1 : -1, s, sort, fart: sort.fart * (0.9 + 0.2 * Math.random()), kaj: 0, ute: 0, rederi: Math.floor(Math.random() * REDERI.length) };
    }
    return null;
  }

  /** En pendelbåt: vitt skrov med mörk vattenlinje, en salong med fönster, styrhytt, skorsten och flagga. */
  function ritaPendelbat(p: Penna, sort: Sort, k: number) {
    const L = sort.langd;
    const B = sort.bredd;
    const form = skrovform(L, B);
    prisma(p, form, 0, 0.7, '#1d2f4f', '#22375c', '#16233c');
    prisma(p, form, 0.7, 2.0, '#b9c3c9', VITT, VITT_SKUGGA, KANT);
    const salong = () => {
      lada3(p, -0.36 * L, 0.24 * L, -0.36 * B, 0.36 * B, 2.0, 4.4, '#eef1f3', VITT, VITT_SKUGGA);
      langband(p, -0.33 * L, 0.21 * L, 0.36 * B, 2.8, 3.7, GLAS);
      kortband(p, 0.24 * L, true, -0.3 * B, 0.3 * B, 2.8, 3.7, GLAS);
    };
    const skorsten = () => {
      lada3(p, -0.27 * L, -0.19 * L, -0.11 * B, 0.11 * B, 4.4, 6.6, '#22262c', '#e0b62e', '#b8921c');
    };
    const styrhytt = () => {
      lada3(p, 0.03 * L, 0.19 * L, -0.25 * B, 0.25 * B, 4.4, 6.4, '#eef0f2', VITT, VITT_SKUGGA);
      langband(p, 0.04 * L, 0.18 * L, 0.25 * B, 5.2, 6.0, GLAS);
      kortband(p, 0.19 * L, true, -0.22 * B, 0.22 * B, 5.2, 6.0, GLAS);
    };
    salong();
    // det som står akterut ligger närmast kameran när båten går bort från den
    if (RDF > 0) {
      styrhytt();
      skorsten();
    } else {
      skorsten();
      styrhytt();
    }
    flagga(p, -0.47 * L, 2.0, 1.5, k);
  }

  /** Ett fartyg: skrov i rederiets färg, tre våningar med fönsterrader, livbåtar, brygga och skorsten. */
  function ritaFartyg(p: Penna, sort: Sort, rederi: [string, string]) {
    const L = sort.langd;
    const B = sort.bredd;
    const form = skrovform(L, B);
    const [skrovfarg, skorstensfarg] = rederi;
    prisma(p, form, 0, 2.5, '#1a2230', '#232d3f', '#141a26');
    prisma(p, form, 2.5, 10, '#b9c3c9', v.skugga(skrovfarg, 1), v.skugga(skrovfarg, 0.76), KANT);
    lada3(p, -0.44 * L, 0.33 * L, -0.47 * B, 0.47 * B, 10, 19, '#dfe3e7', VITT, VITT_SKUGGA);
    langband(p, -0.42 * L, 0.31 * L, 0.47 * B, 11.4, 12.9, GLAS);
    langband(p, -0.42 * L, 0.31 * L, 0.47 * B, 14.6, 16.1, GLAS);
    kortband(p, 0.33 * L, true, -0.42 * B, 0.42 * B, 14.6, 16.1, GLAS);
    for (let i = 0; i < 5; i += 1) langband(p, (-0.3 + i * 0.12) * L, (-0.3 + i * 0.12 + 0.06) * L, 0.47 * B, 17.2, 18.6, '#e4672e');
    lada3(p, -0.4 * L, 0.27 * L, -0.42 * B, 0.42 * B, 19, 25, '#e6e9ec', VITT, VITT_SKUGGA);
    langband(p, -0.38 * L, 0.25 * L, 0.42 * B, 20.6, 22.6, GLAS);
    const brygga = () => {
      lada3(p, 0.17 * L, 0.27 * L, -0.5 * B, 0.5 * B, 25, 29, '#eef0f2', VITT, VITT_SKUGGA);
      langband(p, 0.175 * L, 0.265 * L, 0.5 * B, 26.6, 28.2, GLAS);
      kortband(p, 0.27 * L, true, -0.47 * B, 0.47 * B, 26.6, 28.2, GLAS);
    };
    const skorsten = () => {
      lada3(p, -0.3 * L, -0.2 * L, -0.2 * B, 0.2 * B, 25, 37, v.skugga(skorstensfarg, 0.6), v.skugga(skorstensfarg, 1), v.skugga(skorstensfarg, 0.74));
    };
    if (RDF > 0) {
      brygga();
      skorsten();
    } else {
      skorsten();
      brygga();
    }
  }

  return {
    oppna() {
      nat = null;
      farjor = [];
      urval = null;
      alder = 9;
      fragat = false;
    },
    rensa() {
      farjor = [];
    },
    steg(dt, vy) {
      if (v.niva() < 2) {
        farjor.length = 0;
        return;
      }
      if (!nat) {
        if (!fragat && vy.mpp <= MAX_MPP + 1.5) {
          fragat = true;
          v.hamtaNat('ferries', (hamtat) => (nat = hamtat));
        }
        return;
      }
      const n = nat;
      if (vy.mpp > MAX_MPP + 0.4) {
        farjor.length = 0;
        return;
      }
      alder += dt;
      if (alder > 2) {
        omrade = vidgad(vy, 1.0);
        urval = samla(n, omrade, (e, meter) => (meter / 1000) * sortAv(n, e).perKm);
        mal = Math.min(TAK, Math.round(urval.totalt + 0.3));
        alder = 0;
      }
      if (!omrade) return;
      for (let i = farjor.length - 1; i >= 0; i -= 1) {
        const f = farjor[i];
        let langd = n.start[f.e + 1] - n.start[f.e];
        if (f.kaj > 0) {
          f.kaj -= dt; // ligger vid sin kaj
        } else {
          f.s += ((f.hall * f.fart) / n.steg) * dt;
          if (f.s > langd - 1 || f.s < 0) {
            const nasta = vidare(n, f.e, f.hall);
            if (nasta) {
              f.e = Math.abs(nasta) - 1;
              f.hall = nasta > 0 ? 1 : -1;
              langd = n.start[f.e + 1] - n.start[f.e];
              f.s = f.hall > 0 ? 0 : langd - 1;
            } else {
              // linjens slut: den ligger still en stund och går tillbaka
              f.s = mellan(f.s, 0, langd - 1);
              f.hall = -f.hall;
              f.kaj = 25 + 40 * Math.random();
            }
          }
        }
        const vid = n.start[f.e] + Math.round(mellan(f.s, 0, langd - 1));
        if (inom(omrade, n.x[vid], n.y[vid])) f.ute = 0;
        else {
          f.ute += dt;
          if (f.ute > 1) {
            farjor[i] = farjor[farjor.length - 1];
            farjor.pop();
          }
        }
      }
      if (!urval || !urval.kanter.length) return;
      const satt = farjor.length >= 0.6 * mal;
      for (let k = Math.min(satt ? 1 : 6, mal - farjor.length); k > 0; k -= 1) {
        const ny = nyFarja(n, vy, satt);
        if (ny) farjor.push(ny);
      }
    },
    rita(vy) {
      if (!nat || !farjor.length) return;
      const n = nat;
      const toning = mellan((MAX_MPP - vy.mpp) / 0.8, 0, 1);
      if (toning <= 0) return;
      const p = v.penna;
      const nara = vidgad(vy, 0.15);
      const k = vy.skala / v.mpb;
      for (const f of farjor) {
        const sort = f.sort;
        const a = n.start[f.e];
        const langd = n.start[f.e + 1] - a;
        const s = mellan(f.s, 0, langd - 1.001);
        const i0 = a + Math.floor(s);
        const i1 = Math.min(i0 + 1, a + langd - 1);
        const andel = s - Math.floor(s);
        // under en bro tonas den bort och fram igen, över sin egen längd
        let syn = 0;
        for (let d = -2; d <= 2; d += 1) syn += n.syns[mellan(i0 + d, a, a + langd - 1)];
        syn /= 5;
        if (syn < 0.04) continue;
        const mx = n.x[i0] + (n.x[i1] - n.x[i0]) * andel;
        const my = n.y[i0] + (n.y[i1] - n.y[i0]) * andel;
        if (!inom(nara, mx, my)) continue;
        const j0 = Math.max(a, i0 - 3);
        const j1 = Math.min(a + langd - 1, i1 + 3);
        let dr = (n.x[j1] - n.x[j0]) * f.hall;
        let df = -(n.y[j1] - n.y[j0]) * ROT2 * f.hall;
        const dl = Math.hypot(dr, df);
        if (dl < 1e-6) continue;
        dr /= dl;
        df /= dl;
        const x = vy.ox + mx * vy.skala;
        const y = vy.oy + my * vy.skala;
        p.globalAlpha = toning * syn;
        if (f.kaj <= 0) kolvatten(v, vy, x, y, dr, df, sort.langd, sort.bredd, sort.langd * 0.7, toning * syn * 0.55);
        stallRit(x, y, dr, df, k);
        if (sort.stor) ritaFartyg(p, sort, REDERI[f.rederi]);
        else ritaPendelbat(p, sort, k);
      }
      p.globalAlpha = 1;
    },
    tillstand: () => ({ farjor: farjor.length, farjemal: mal, farjelinjer: nat ? nat.E : 0 }),
  };
}

/* ---------- småbåtar på öppet vatten ---------- */

function batdel(v: Verktyg): Del {
  const MAX_MPP = 2.4;
  const TONING_MPP = 0.6;
  const TAK = 24;
  const KVADRATMETER_PER_BAT = 200000; // en båt per tjugo hektar öppet vatten
  const UTANFOR = 0.6;
  const SEGELBAT = 0;
  const MOTORBAT = 1;
  const JOLLE = 2;
  const SEGELDUK = '#fbfaf4';
  type Vatten = { b: number; h: number; bitar: Uint8Array; cell: number };
  type Bat = {
    x: number;
    y: number;
    th: number;
    svang: number;
    styr: number;
    sort: number;
    fart: number;
    langd: number;
    lack: string;
    /** Åt vilken sida bommen står ut, och hur långt: -1 till 1. */
    bom: number;
    alfa: number;
    ute: number;
    /** Den har gått på grund i den grova vattenbilden och tonas bort. */
    bort: boolean;
  };
  let vatten: Vatten | null = null; // cell: bildpunkter i kartbilden per cell
  let batar: Bat[] = [];
  let omrade: Omrade | null = null;
  let alder = 9;
  let mal = 0;

  function arVatten(x: number, y: number): boolean {
    if (!vatten) return false;
    const cx = Math.floor(x / vatten.cell);
    const cy = Math.floor(y / vatten.cell);
    if (cx < 0 || cy < 0 || cx >= vatten.b || cy >= vatten.h) return false;
    return vatten.bitar[cy * vatten.b + cx] === 1;
  }

  /** Öppet vatten runt om, så att en båt inte börjar mot en kaj. */
  function arOppet(x: number, y: number): boolean {
    if (!vatten) return false;
    const c = vatten.cell;
    return arVatten(x, y) && arVatten(x - 2 * c, y) && arVatten(x + 2 * c, y) && arVatten(x, y - 2 * c) && arVatten(x, y + 2 * c);
  }

  /** Ett steg på `meter` i riktningen `th` på marken, i bildpunkter. */
  const framfor = (x: number, y: number, th: number, meter: number): { x: number; y: number } => ({
    x: x + (Math.cos(th) * meter) / v.mpb,
    y: y - (Math.sin(th) * meter) / (ROT2 * v.mpb),
  });

  function rakna(vy: Vy) {
    if (!vatten) return;
    omrade = vidgad(vy, UTANFOR);
    let celler = 0;
    const c = vatten.cell;
    for (let y = omrade.y0; y <= omrade.y1; y += c * 2) {
      for (let x = omrade.x0; x <= omrade.x1; x += c * 2) if (arVatten(x, y)) celler += 4;
    }
    const meter = c * v.mpb;
    mal = Math.min(TAK, Math.round((celler * meter * meter) / KVADRATMETER_PER_BAT));
  }

  function nyBat(vy: Vy, dold: boolean): Bat | null {
    if (!omrade) return null;
    for (let forsok = 0; forsok < 12; forsok += 1) {
      const x = omrade.x0 + Math.random() * (omrade.x1 - omrade.x0);
      const y = omrade.y0 + Math.random() * (omrade.y1 - omrade.y0);
      if (!arOppet(x, y)) continue;
      if (dold && inom(vy, x, y)) continue;
      const slump = Math.random();
      const sort = slump < 0.4 ? SEGELBAT : slump < 0.85 ? MOTORBAT : JOLLE;
      return {
        x,
        y,
        th: Math.random() * Math.PI * 2,
        svang: 0,
        styr: 0,
        sort,
        fart: sort === SEGELBAT ? 2.2 + 1.3 * Math.random() : sort === MOTORBAT ? 4.5 + 5 * Math.random() : 2.5 + 2 * Math.random(),
        langd: sort === SEGELBAT ? 8.5 + 3 * Math.random() : sort === MOTORBAT ? 6 + 3 * Math.random() : 4.2 + 0.8 * Math.random(),
        lack: Math.random() < 0.72 ? '#f6f4ee' : Math.random() < 0.5 ? '#2b4a78' : '#7a2f28',
        bom: (Math.random() < 0.5 ? -1 : 1) * (0.5 + 0.5 * Math.random()),
        alfa: dold ? 1 : 0,
        ute: 0,
        bort: false,
      };
    }
    return null;
  }

  /** Båten: skrov med däck, och på det ruff och segel, eller ruff med rutor och motor, eller en roddare. */
  function ritaBat(p: Penna, b: Bat, k: number) {
    const L = b.langd;
    const B = L * (b.sort === SEGELBAT ? 0.3 : 0.36);
    const form = skrovform(L, B);
    prisma(p, form, 0, b.sort === JOLLE ? 0.5 : 0.8, b.sort === JOLLE ? '#b98f5b' : '#d9cfb8', v.skugga(b.lack, 1), v.skugga(b.lack, 0.72), 'rgba(16,28,48,0.5)');
    if (b.sort === SEGELBAT) {
      const upp = 0.8;
      lada3(p, -0.12 * L, 0.2 * L, -0.26 * B, 0.26 * B, upp, upp + 0.5, '#f3f0e6', '#fbfaf4', '#d6d2c5');
      // masten med storseglet akterut och focken förut; bommen står ut åt lä
      const mast = 0.14 * L;
      const topp = upp + 1.25 * L;
      const ut = b.bom * 0.2 * L;
      streck(p, mast, 0, upp, mast, 0, topp, '#4a4f57', Math.max(0.7, 0.12 * k));
      trekant(p, mast, 0, upp + 0.9, mast, 0, topp, -0.4 * L, ut, upp + 0.9, SEGELDUK);
      trekant(p, 0.47 * L, 0, upp, mast, 0, topp * 0.88, 0.1 * L, ut * 0.55, upp + 0.5, v.skugga(SEGELDUK, 0.9));
      // en tunn kant, så att seglet syns mot ljust vatten och ljusa tak
      p.strokeStyle = 'rgba(40,52,66,0.5)';
      p.lineWidth = Math.max(0.5, 0.09 * k);
      p.beginPath();
      p.moveTo(skX(mast, 0, topp), skY(mast, 0, topp));
      p.lineTo(skX(-0.4 * L, ut, upp + 0.9), skY(-0.4 * L, ut, upp + 0.9));
      p.lineTo(skX(mast, 0, upp + 0.9), skY(mast, 0, upp + 0.9));
      p.stroke();
    } else if (b.sort === MOTORBAT) {
      // sittbrunnen akterut, ruffen med rutor, och motorn i aktern
      lada3(p, -0.4 * L, 0.0, -0.3 * B, 0.3 * B, 0.8, 0.84, '#8f7a5c', '#8f7a5c', '#8f7a5c');
      const ruff = () => lada3(p, 0.0, 0.22 * L, -0.34 * B, 0.34 * B, 0.8, 1.5, '#f6f4ee', GLAS_LJUST, GLAS);
      const motor = () => lada3(p, -0.52 * L, -0.44 * L, -0.12 * B, 0.12 * B, 0.4, 1.25, '#2c3138', '#343a42', '#1c2026');
      if (RDF > 0) {
        ruff();
        motor();
      } else {
        motor();
        ruff();
      }
    } else {
      // en jolle: två tofter och någon i flytväst
      lada3(p, -0.2 * L, -0.12 * L, -0.4 * B, 0.4 * B, 0.5, 0.56, '#8a6a43', '#8a6a43', '#8a6a43');
      lada3(p, 0.12 * L, 0.2 * L, -0.36 * B, 0.36 * B, 0.5, 0.56, '#8a6a43', '#8a6a43', '#8a6a43');
      lada3(p, -0.1 * L, 0.02 * L, -0.14 * B, 0.14 * B, 0.5, 1.3, '#f0c9a0', '#e4672e', '#b84f20');
    }
  }

  return {
    oppna(stad) {
      vatten = null;
      batar = [];
      alder = 9;
      if (!stad.filer.water) return;
      const bild = new Image();
      bild.crossOrigin = 'anonymous';
      bild.onload = () => {
        if (v.stad() !== stad) return;
        const ark = document.createElement('canvas');
        ark.width = bild.naturalWidth;
        ark.height = bild.naturalHeight;
        const p = ark.getContext('2d', { willReadFrequently: true });
        if (!p) return;
        p.drawImage(bild, 0, 0);
        const data = p.getImageData(0, 0, ark.width, ark.height).data;
        const bitar = new Uint8Array(ark.width * ark.height);
        for (let i = 0; i < bitar.length; i += 1) bitar[i] = data[i * 4] > 127 ? 1 : 0;
        vatten = { b: ark.width, h: ark.height, bitar, cell: stad.bredd / ark.width };
      };
      bild.src = v.adress(stad.filer.water);
    },
    rensa() {
      batar = [];
    },
    steg(dt, vy) {
      if (!vatten || vy.mpp > MAX_MPP + 0.3 || v.niva() < 2) {
        batar.length = 0;
        return;
      }
      alder += dt;
      if (alder > 1.5) {
        rakna(vy);
        alder = 0;
      }
      if (!omrade) return;
      let kvar = 0;
      for (let i = batar.length - 1; i >= 0; i -= 1) {
        const b = batar[i];
        let borta = false;
        if (b.bort) {
          b.alfa -= dt * 1.6;
          borta = b.alfa <= 0.03;
        } else {
          kvar += 1;
          // Båten ser en bit framför sig. Land där: den svänger mot den sida som har vatten och
          // fortsätter svänga tills vägen fram är fri. Öppet vatten: den driver lite hit och dit.
          const rackvidd = 45 + b.fart * 6;
          const fram = framfor(b.x, b.y, b.th, rackvidd);
          if (!arVatten(fram.x, fram.y)) {
            if (!b.styr) {
              const vanster = framfor(b.x, b.y, b.th + 0.9, rackvidd);
              const hoger = framfor(b.x, b.y, b.th - 0.9, rackvidd);
              const vv = arVatten(vanster.x, vanster.y);
              const hv = arVatten(hoger.x, hoger.y);
              b.styr = vv && !hv ? 1 : !vv && hv ? -1 : Math.random() < 0.5 ? 1 : -1;
            }
            b.svang = b.styr * 0.9;
          } else {
            b.styr = 0;
            b.svang += (Math.random() - 0.5) * 0.6 * dt;
            b.svang *= 1 - Math.min(1, dt * 0.8);
          }
          b.th += b.svang * dt;
          const takt = b.styr ? 0.55 : 1; // långsammare medan den svänger undan från land
          const nasta = framfor(b.x, b.y, b.th, b.fart * takt * dt);
          // Den går inte upp på land i den grova vattenbilden: den stannar och tonas bort.
          if (arVatten(nasta.x, nasta.y)) {
            b.x = nasta.x;
            b.y = nasta.y;
          } else {
            b.bort = true;
          }
          b.alfa += (1 - b.alfa) * Math.min(1, dt * 2);
          if (inom(omrade, b.x, b.y)) b.ute = 0;
          else {
            b.ute += dt;
            if (b.ute > 0.5) borta = true;
          }
        }
        if (borta) {
          batar[i] = batar[batar.length - 1];
          batar.pop();
        }
      }
      const satt = kvar >= 0.7 * mal;
      for (let k = Math.min(satt ? 2 : 30, mal - kvar); k > 0; k -= 1) {
        const ny = nyBat(vy, satt);
        if (ny) batar.push(ny);
      }
    },
    rita(vy) {
      if (!vatten || !batar.length) return;
      const toning = mellan((MAX_MPP - vy.mpp) / TONING_MPP, 0, 1);
      if (toning <= 0) return;
      const p = v.penna;
      const k = vy.skala / v.mpb;
      for (const b of batar) {
        if (!inom(vy, b.x, b.y)) continue;
        const x = vy.ox + b.x * vy.skala;
        const y = vy.oy + b.y * vy.skala;
        const dr = Math.cos(b.th);
        const df = Math.sin(b.th);
        const alfa = toning * mellan(b.alfa, 0, 1);
        p.globalAlpha = alfa;
        if (!b.bort) kolvatten(v, vy, x, y, dr, df, b.langd, b.langd * 0.33, b.sort === MOTORBAT ? b.langd * (0.6 + b.fart * 0.08) : b.langd * 0.5, alfa * (b.sort === MOTORBAT ? 0.6 : 0.35));
        if (b.langd * k < 3.2) {
          // långt ute: en ljus prick
          p.fillStyle = b.lack;
          p.fillRect(x - 1, y - 1, 2, 2);
          continue;
        }
        stallRit(x, y, dr, df, k);
        ritaBat(p, b, k);
      }
      p.globalAlpha = 1;
    },
    tillstand: () => ({ batar: batar.length, batmal: mal, vatten: !!vatten }),
  };
}

/* ---------- lagret: duken, bilarna, fåglarna och takten ---------- */

export function skapaLiv(val: {
  bibliotek: typeof OpenSeadragon;
  visare: OpenSeadragon.Viewer;
  /** Dukarna läggs in i kartans ruta, före det här elementet. */
  fore: HTMLElement;
  /** Bildtjänstens adress, fram till och med versionen. */
  bas: string;
  /** Meter mark per bildpunkt i kartbilden. */
  mpb: number;
  ruta(): { bredd: number; hojd: number };
  /** Ett kort besked till besökaren. */
  sag(text: string, lange?: number): void;
  /** Fler delar, som får lagrets verktyg (träd och vatten som rör sig, och det som flyger). */
  delar?: ((v: Verktyg) => Del)[];
}): Liv {
  const { bibliotek, visare, mpb } = val;
  const duk = document.createElement('canvas');
  duk.className = 'pixelliv';
  duk.setAttribute('aria-hidden', 'true');
  const underduk = document.createElement('canvas');
  underduk.className = 'pixelliv pixelliv--punkter';
  underduk.setAttribute('aria-hidden', 'true');
  val.fore.parentElement?.insertBefore(underduk, val.fore);
  val.fore.parentElement?.insertBefore(duk, val.fore);
  const penna = duk.getContext('2d') as CanvasRenderingContext2D;

  let pa = false;
  let stad: Livsstad | null = null;
  let B = 0;
  let H = 0;
  let tathet = 1;
  let senast = 0;
  let klocka = 0;
  let slinga = 0;

  const PERSONBIL = 0;
  const TAXI = 1;
  const SKAPBIL = 2;
  const LASTBIL = 3;
  const BUSS = 4;
  type Fagel = { langs: number; tvars: number; fas: number; takt: number };
  type Flock = { x: number; y: number; vx: number; vy: number; faglar: Fagel[]; lyft: number; liv: number; tonas: boolean };
  type Bil = {
    e: number;
    hall: number;
    s: number;
    fart: number;
    /** Filen den ska ligga i, i meter till höger om vägens mitt, och var den ligger just nu. */
    fil: number;
    sida: number;
    sort: number;
    langd: number;
    bredd: number;
    hojd: number;
    lack: string;
    /** Riktningen den ritas i: den följer vägens, men svänger mjukt genom en korsning. */
    vr: number;
    vf: number;
    vriden: number;
    alfa: number;
    /** Sekunder den har synts i rutan i ett sträck. */
    syn: number;
    ute: number;
    rum: number; // hur långt den får gå i den här bildrutan innan den är för nära bilen framför
    haller: number; // korsningen den har, om någon
    forbi: number; // meter körda sedan den gick genom den korsningen
    vantat: number; // sekunder den har stått och väntat på en korsning
    dod: boolean;
    /** Den ska bort medan den syns, och tonas bort där den står. */
    bort: boolean;
  };
  let flockar: Flock[] = [];
  let vagar: Nat | null = null;
  let bilar: Bil[] = [];
  const urval = { kanter: [] as number[], vikter: [] as number[], totalt: 0, mal: 0, alder: 9, nyckel: '' };
  let omrade: Omrade | null = null; // där bilar hålls, i bildpunkter
  const las = new Map<number, Bil>(); // korsning -> bilen som har den
  let fragat: Record<string, boolean> = {};
  // hur ofta lagret ritades i sin egen takt och i kartans bildruta
  const rakning = { egna: 0, medKartan: 0 };
  // för prov: bilar som har vänt i en återvändsgata, och bilar som har tonats bort medan de syntes
  const handelser = { vanda: 0, tonade: 0 };
  // för prov: hur länge de senaste bilarna syntes i rutan i ett sträck, i sekunder
  const lopp = new Float32Array(256);
  let loppantal = 0;
  const noteraLopp = (bil: Bil) => {
    if (bil.syn <= 0) return;
    lopp[loppantal % lopp.length] = bil.syn;
    loppantal += 1;
    bil.syn = 0;
  };

  // hur mycket som visas: 3 allt, 2 mindre, 1 minst (se filens början)
  const liten =
    window.matchMedia('(pointer: coarse)').matches ||
    ((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8) <= 4 ||
    (navigator.hardwareConcurrency || 8) <= 4;
  let niva = liten ? 2 : 3;
  let tak = 3; // den går inte över det här igen när den har fått gå ner två gånger
  const takt = { ruta: 16.7, arbete: 0, trogt: 0, latt: 0, steg: 0 };

  const skuggor = new Map<string, string>();
  const skugga = (hex: string, faktor: number): string => {
    const nyckel = hex + faktor;
    let s = skuggor.get(nyckel);
    if (!s) skuggor.set(nyckel, (s = skuggad(hex, faktor)));
    return s;
  };
  const adress = (fil: string): string => val.bas + fil;

  /** Hämtar ett av den öppna stadens nät och lämnar över det. Saknas det rör sig inget av den sorten. */
  function hamtaNat(sort: 'roads' | 'rails' | 'ferries', klart: (nat: Nat) => void) {
    const for_ = stad;
    const b = for_?.filer[sort];
    if (!for_ || !b || typeof DecompressionStream === 'undefined') return;
    fetch(adress(b.file))
      .then((svar) => {
        if (!svar.ok || !svar.body) throw new Error('inget nät');
        return new Response(svar.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
      })
      .then((buffert) => {
        if (stad === for_) klart(lasNat(b, buffert));
      })
      .catch(() => {
        /* staden har inget sådant nät, eller så kom det inte: inget av den sorten rör sig */
      });
  }

  const verktyg: Verktyg = {
    visare,
    penna,
    niva: () => niva,
    stad: () => stad,
    mpb,
    ruta: () => ({ bredd: B, hojd: H, tathet }),
    klocka: () => klocka,
    skugga,
    hamtaNat,
    adress,
    dukUnder: () => underduk,
    sag: val.sag,
  };
  const delar: Del[] = [tagdel(verktyg), farjedel(verktyg), batdel(verktyg), ...(val.delar ?? []).map((gor) => gor(verktyg))];

  /** Var kartbilden ligger i rutan just nu, enligt bildvisaren. */
  function vyNu(): Vy | null {
    if (!stad || !visare.world.getItemCount() || B < 2) return null;
    const p0 = visare.viewport.imageToViewerElementCoordinates(new bibliotek.Point(0, 0));
    const p1 = visare.viewport.imageToViewerElementCoordinates(new bibliotek.Point(1000, 0));
    const skala = (p1.x - p0.x) / 1000;
    if (!(skala > 0)) return null;
    return { skala, ox: p0.x, oy: p0.y, mpp: mpb / skala, x0: -p0.x / skala, y0: -p0.y / skala, x1: (B - p0.x) / skala, y1: (H - p0.y) / skala };
  }

  /* ---------- fåglar ---------- */

  /**
   * En flock som ska korsa rutan. Med `redan` är den någonstans på väg genom rutan från början
   * och tonas in, annars börjar den utanför, på den sida den flyger in från.
   */
  function nyFlock(vy: Vy, redan: boolean): Flock {
    const slump = Math.random;
    const fart = (14 + 6 * slump()) / mpb; // bildpunkter per sekund: 14 till 20 m/s
    const vinkel = slump() * Math.PI * 2;
    const vx = Math.cos(vinkel) * fart;
    const vyy = (Math.sin(vinkel) * fart) / ROT2;
    const spannX = vy.x1 - vy.x0;
    const spannY = vy.y1 - vy.y0;
    // den korsar rutan nära den här punkten
    const cx = (vy.x0 + vy.x1) / 2 + (slump() - 0.5) * spannX * 0.8;
    const cy = (vy.y0 + vy.y1) / 2 + (slump() - 0.5) * spannY * 0.8;
    const bak = ((redan ? 0.5 * slump() - 0.1 : 0.75) * Math.max(spannX, spannY)) / fart;
    const flock: Flock = { x: cx - vx * bak, y: cy - vyy * bak, vx, vy: vyy, faglar: [], lyft: (30 + 50 * slump()) / (ROT2 * mpb), liv: 0, tonas: redan };
    const antal = 4 + Math.floor(slump() * 8);
    for (let i = 0; i < antal; i += 1) {
      // ett löst V bakom den första fågeln; avstånden är i vinglängder, så de håller i varje zoom
      const rad = Math.ceil(i / 2);
      const sida = i % 2 ? 1 : -1;
      flock.faglar.push({ langs: -rad * (2.6 + 1.2 * slump()), tvars: sida * rad * (2.0 + 1.0 * slump()), fas: slump() * 6.28, takt: 6 + 3 * slump() });
    }
    return flock;
  }

  function stegFaglar(dt: number, vy: Vy) {
    if (VINGE / vy.mpp < VINGE_MINST) {
      flockar = [];
      return;
    }
    const spannX = vy.x1 - vy.x0;
    const spannY = vy.y1 - vy.y0;
    for (let i = flockar.length - 1; i >= 0; i -= 1) {
      const f = flockar[i];
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.liv += dt;
      const langt = f.x < vy.x0 - 1.5 * spannX || f.x > vy.x1 + 1.5 * spannX || f.y < vy.y0 - 1.5 * spannY || f.y > vy.y1 + 1.5 * spannY;
      if (langt && f.liv > 4) flockar.splice(i, 1);
    }
    let iRutan = 0;
    for (const f of flockar) if (f.x > vy.x0 && f.x < vy.x1 && f.y > vy.y0 && f.y < vy.y1) iRutan += 1;
    // det finns alltid en flock eller två att se; resten kommer in utifrån
    if (iRutan < 2 && flockar.length < 7) flockar.push(nyFlock(vy, true));
    else if (flockar.length < 7 && Math.random() < dt * 0.9) flockar.push(nyFlock(vy, false));
  }

  /**
   * En fågel: en liten kropp och två vingar som slår. Den ritas tre gånger: skuggan på marken,
   * en mörk kant, och den vita fågeln, så att den syns över vatten, tak och träd. Nära marken
   * växer den inte längre med kartan: en mås i en ruta som är hundra meter bred är ingen jätte.
   */
  function ritaFaglar(vy: Vy) {
    if (!flockar.length) return;
    const vinge = Math.min(VINGE / vy.mpp, 4.6); // skärmpunkter
    const toning = mellan((VINGE / vy.mpp - VINGE_MINST) / 1.2, 0, 1);
    if (toning <= 0) return;
    penna.lineCap = 'round';
    penna.lineJoin = 'round';
    const varv = [
      { farg: 'rgba(6,12,20,0.30)', bredd: vinge * 0.42, lyft: false },
      { farg: 'rgba(14,22,34,0.85)', bredd: vinge * 0.46 + Math.min(1.6, vinge * 0.3), lyft: true },
      { farg: '#fbf9f2', bredd: vinge * 0.46, lyft: true },
    ];
    for (const f of flockar) {
      // en flock som ställs mitt i rutan tonas in
      penna.globalAlpha = toning * (f.tonas ? mellan(f.liv / 1.2, 0, 1) : 1);
      const fart = Math.hypot(f.vx, f.vy);
      const ux = f.vx / fart;
      const uy = f.vy / fart;
      for (const v of varv) {
        penna.strokeStyle = v.farg;
        penna.lineWidth = Math.max(1, v.bredd);
        penna.beginPath();
        for (const fagel of f.faglar) {
          const x = vy.ox + f.x * vy.skala + (ux * fagel.langs - uy * fagel.tvars) * vinge;
          const y = vy.oy + f.y * vy.skala + (uy * fagel.langs + ux * fagel.tvars) * vinge - (v.lyft ? f.lyft * vy.skala : 0);
          if (x < -30 || y < -30 || x > B + 30 || y > H + 30) continue;
          // Vingslaget, sett uppifrån: vingarna blir kortare när de står upp eller ner, lika på båda sidor.
          const slag = Math.sin(klocka * fagel.takt + fagel.fas);
          const spann = vinge * (0.62 + 0.38 * (0.5 + 0.5 * slag));
          // kroppen, ett kort streck längs flykten
          penna.moveTo(x - ux * vinge * 0.32, y - uy * vinge * 0.32);
          penna.lineTo(x + ux * vinge * 0.24, y + uy * vinge * 0.24);
          // vingarna: ut åt båda håll, lite framåt i knogen och svepta bakåt i spetsarna
          const tx = -uy * spann;
          const ty = ux * spann * 0.72;
          const bx = ux * vinge * 0.34;
          const by = uy * vinge * 0.34;
          penna.moveTo(x + tx - bx, y + ty - by);
          penna.quadraticCurveTo(x + tx * 0.5 + bx * 0.45, y + ty * 0.5 + by * 0.45, x, y);
          penna.quadraticCurveTo(x - tx * 0.5 + bx * 0.45, y - ty * 0.5 + by * 0.45, x - tx - bx, y - ty - by);
        }
        penna.stroke();
      }
    }
    penna.globalAlpha = 1;
  }

  /* ---------- vägar och bilar ---------- */

  const iOmradet = (x: number, y: number): boolean => !!omrade && inom(omrade, x, y);
  // En väg som syns bär trafiken, och en som ligger bakom husen nästan ingen: bilarna är till för
  // att ses. En bil på en gata bakom husen syns bara som en blink i varje korsning den passerar.
  const synvikt = (n: Nat, e: number): number => 0.06 + 0.94 * (n.synlig[e] / 255) ** 2;
  const platsAv = (n: Nat, bil: Bil): number => n.start[bil.e] + Math.round(mellan(bil.s, 0, n.start[bil.e + 1] - n.start[bil.e] - 1));

  /** Kanterna i området där bilar hålls, och hur många bilar så mycket väg ska bära. */
  function fornyaUrval(n: Nat, vy: Vy) {
    omrade = vidgad(vy, OMRADE);
    const samlat = samla(n, omrade, (e, meter) => (meter / LUCKA[n.info[e] & 7]) * synvikt(n, e));
    urval.kanter = samlat.kanter;
    urval.vikter = samlat.summor;
    urval.totalt = samlat.totalt;
    urval.mal = Math.round(Math.min(BILTAK, urval.totalt) * BILANDEL[niva]);
    urval.alder = 0;
  }

  /**
   * En ny bil någonstans i området. Med `dold` måste den börja där den inte syns: utanför rutan,
   * eller på en vägsträcka bakom ett hus.
   */
  function nyBil(n: Nat, vy: Vy, dold: boolean): Bil | null {
    if (!urval.kanter.length) return null;
    for (let forsok = 0; forsok < 6; forsok += 1) {
      const e = valjKant({ kanter: urval.kanter, summor: urval.vikter, totalt: urval.totalt });
      const langd = n.start[e + 1] - n.start[e];
      const s = Math.random() * (langd - 1);
      const vid = n.start[e] + Math.round(s);
      const x = n.x[vid];
      const y = n.y[vid];
      if (!iOmradet(x, y)) continue;
      const iRutan = x > vy.x0 && x < vy.x1 && y > vy.y0 && y < vy.y1;
      if (dold && iRutan && n.syns[vid]) continue;
      const info = n.info[e];
      const klass = info & 7;
      const enkelriktad = (info & 8) !== 0;
      const slump = Math.random();
      const sort = klass >= 1 && klass <= 3 && slump < 0.06 ? BUSS : klass <= 1 && slump > 0.93 ? LASTBIL : slump > 0.85 ? SKAPBIL : slump > 0.81 ? TAXI : PERSONBIL;
      const farger = sort === BUSS ? (BUSSLACK[stad?.id ?? ''] ?? BUSSLACK.stockholm) : sort === LASTBIL ? HYTTLACK : sort === SKAPBIL ? SKAPLACK : LACK;
      const fil = enkelriktad ? (Math.random() < 0.5 ? -1.7 : 1.7) * (klass === 0 ? 1 : 0.6) : 1.7;
      return {
        e,
        hall: enkelriktad || Math.random() < 0.5 ? 1 : -1,
        s,
        fart: FART[klass] * (0.82 + 0.3 * Math.random()),
        fil,
        sida: fil,
        sort,
        langd: sort === BUSS ? 12 : sort === LASTBIL ? 9.5 : sort === SKAPBIL ? 5.4 : 4.3 + 0.5 * Math.random(),
        bredd: sort === BUSS || sort === LASTBIL ? 2.5 : sort === SKAPBIL ? 2.0 : 1.85,
        hojd: sort === BUSS ? 3.05 : sort === LASTBIL ? 3.3 : sort === SKAPBIL ? 1.95 : 1.4,
        lack: sort === TAXI ? '#1d1f24' : farger[Math.floor(Math.random() * farger.length)],
        vr: 0,
        vf: 0,
        vriden: -1,
        // en bil som börjar utom synhåll är hel direkt; en som ställs in i rutan tonas in
        alfa: iRutan && n.syns[vid] ? 0 : 1,
        syn: 0,
        ute: 0,
        rum: Infinity,
        haller: -1,
        forbi: -1,
        vantat: 0,
        dod: false,
        bort: false,
      };
    }
    return null;
  }

  /**
   * Bilen väljer nästa kant i korsningen den har kommit till. I en återvändsgata vänder den och
   * kör tillbaka. Svarar nej bara där en enkelriktad gata tar slut, vid kartbildens kant.
   */
  function nastaKant(n: Nat, bil: Bil): boolean {
    const nod = bil.hall > 0 ? n.till[bil.e] : n.fran[bil.e];
    const har = riktningVid(n, bil.e, bil.hall, true);
    const hl = Math.hypot(har.x, har.y) || 1;
    let bast = 0;
    let totalt = 0;
    const val_: number[] = [];
    const vikter: number[] = [];
    for (let i = n.utStart[nod]; i < n.utStart[nod + 1]; i += 1) {
      const ref = n.ut[i];
      const e = Math.abs(ref) - 1;
      const hall = ref > 0 ? 1 : -1;
      if (e === bil.e) continue; // ingen vänder om där det finns en väg vidare
      const dar = riktningVid(n, e, hall, false);
      const tl = Math.hypot(dar.x, dar.y) || 1;
      const rakt = (har.x * dar.x + har.y * dar.y) / (hl * tl);
      // mest rakt fram, hellre in på en väg av samma slag, och hellre en väg som syns
      const vikt = (0.08 + Math.max(0, rakt) ** 3 * ((n.info[e] & 7) === (n.info[bil.e] & 7) ? 2 : 1)) * synvikt(n, e);
      val_.push(ref);
      totalt += vikt;
      vikter.push(totalt);
    }
    if (!val_.length) {
      if (n.info[bil.e] & 8) return false;
      // Återvändsgata: den vänder. Den står då på fel sida om vägen och glider över till sin egen.
      bil.hall = -bil.hall;
      bil.sida = -bil.sida;
      handelser.vanda += 1;
      return true;
    }
    const dragning = Math.random() * totalt;
    while (bast < vikter.length - 1 && vikter[bast] < dragning) bast += 1;
    const valt = val_[bast];
    const info = n.info[Math.abs(valt) - 1];
    bil.e = Math.abs(valt) - 1;
    bil.hall = valt > 0 ? 1 : -1;
    bil.fart = FART[info & 7] * (0.82 + 0.3 * Math.random());
    if (!(info & 8)) bil.fil = 1.7;
    return true;
  }

  const slappLas = (bil: Bil) => {
    if (bil.haller >= 0 && las.get(bil.haller) === bil) las.delete(bil.haller);
  };

  /** Tar bort bilen på plats `i`, och släpper korsningen den höll. */
  function taBort(i: number) {
    const bil = bilar[i];
    bil.dod = true;
    noteraLopp(bil);
    slappLas(bil);
    bilar[i] = bilar[bilar.length - 1];
    bilar.pop();
  }

  /** Alla bilar bort på en gång, och korsningarna med dem: en bil som inte finns kan inte hålla en korsning. */
  function tomBilar() {
    for (const bil of bilar) bil.dod = true;
    bilar.length = 0;
    las.clear();
  }

  /**
   * För många bilar, när området har krympt eller nivån har gått ner: först bort med dem som ändå
   * inte syns, och de som syns tonas bort där de står i stället för att slockna.
   */
  function gallra(n: Nat, vy: Vy, kvar: number) {
    let over = kvar - (urval.mal + 80);
    if (over <= 0) return;
    for (let i = bilar.length - 1; i >= 0 && over > 0; i -= 1) {
      const bil = bilar[i];
      if (bil.bort) continue;
      const vid = platsAv(n, bil);
      if (bil.alfa < 0.1 || !inom(vy, n.x[vid], n.y[vid])) {
        taBort(i);
        over -= 1;
      }
    }
    for (let i = 0; i < bilar.length && over > 0; i += 1) {
      if (bilar[i].bort) continue;
      bilar[i].bort = true;
      handelser.tonade += 1;
      over -= 1;
    }
  }

  function stegBilar(dt: number, vy: Vy) {
    if (!vagar) {
      // vägnätet hämtas när kartan först kommer nära där bilar syns
      if (!fragat.roads && vy.mpp <= BIL_MAX_MPP + 1.5) {
        fragat.roads = true;
        hamtaNat('roads', (nat) => (vagar = nat));
      }
      return;
    }
    const n = vagar;
    if (vy.mpp > BIL_MAX_MPP + 0.3) {
      if (bilar.length || las.size) tomBilar();
      return;
    }
    urval.alder += dt;
    const nyckel = `${Math.round((vy.x0 * vy.skala) / 160)},${Math.round((vy.y0 * vy.skala) / 160)},${Math.round(Math.log(vy.skala) * 12)}`;
    if (!omrade || urval.alder > 1.2 || (nyckel !== urval.nyckel && urval.alder > 0.2)) {
      fornyaUrval(n, vy);
      urval.nyckel = nyckel;
    }
    // Vem som är framför vem: bilar på samma kant, åt samma håll i samma fil. En bil får komma
    // 2,5 m bakom den framför och går sedan i dess takt.
    const filer = new Map<number, Bil[]>();
    for (const en of bilar) {
      const filnyckel = en.e * 4 + (en.hall > 0 ? 0 : 2) + (en.fil < 0 ? 1 : 0);
      let samma = filer.get(filnyckel);
      if (!samma) filer.set(filnyckel, (samma = []));
      samma.push(en);
      en.rum = Infinity;
    }
    filer.forEach((samma) => {
      if (samma.length < 2) return;
      samma.sort((a, b) => (b.s - a.s) * a.hall); // den som har kommit längst först
      for (let q = 1; q < samma.length; q += 1) {
        const lucka = Math.abs(samma[q - 1].s - samma[q].s) * n.steg - (samma[q - 1].langd + samma[q].langd) / 2;
        samma[q].rum = Math.max(0, lucka - 2.5) / n.steg;
      }
    });
    let kvar = 0; // bilar som inte är på väg att tonas bort
    for (let i = bilar.length - 1; i >= 0; i -= 1) {
      const bil = bilar[i];
      if (bil.bort) {
        bil.alfa -= dt * 2.5;
        if (bil.alfa <= 0.03) taBort(i);
        continue;
      }
      kvar += 1;
      let langd = n.start[bil.e + 1] - n.start[bil.e];
      let flytt = Math.min((bil.fart / n.steg) * dt, bil.rum);
      // I en korsning en bil i taget: den första inom 9 m har den tills den är 8 m förbi. De
      // andra stannar 4 m före. En som har väntat fem sekunder kör ändå, så att inget låser sig
      // för gott. Motorvägar vävs ihop utan det här.
      const nod = bil.hall > 0 ? n.till[bil.e] : n.fran[bil.e];
      const framme = (bil.hall > 0 ? langd - 1 - bil.s : bil.s) * n.steg;
      if (framme < 9 && bil.haller !== nod && (n.info[bil.e] & 7) > 0 && n.utStart[nod + 1] - n.utStart[nod] > 2) {
        const hallare = las.get(nod);
        if (!hallare || hallare.dod) {
          slappLas(bil);
          las.set(nod, bil);
          bil.haller = nod;
          bil.forbi = -1;
          bil.vantat = 0;
        } else if (bil.vantat < 5) {
          flytt = Math.min(flytt, Math.max(0, framme - 4) / n.steg);
          bil.vantat += dt;
        }
      }
      bil.s += bil.hall * flytt;
      // i sidled glider den till sin fil: efter en vändning, eller in på en gata med andra filer
      const glid = bil.fil - bil.sida;
      if (glid) bil.sida += mellan(glid, -2.4 * dt, 2.4 * dt);
      if (bil.forbi >= 0) {
        bil.forbi += flytt * n.steg;
        if (bil.forbi > 8) {
          slappLas(bil);
          bil.haller = -1;
          bil.forbi = -1;
        }
      }
      let vakt = 0;
      while ((bil.s > langd - 1 || bil.s < 0) && vakt < 4) {
        const over = bil.s > langd - 1 ? bil.s - (langd - 1) : -bil.s;
        if (!nastaKant(n, bil)) {
          // vägen tar slut här: den stannar och tonas bort
          bil.s = mellan(bil.s, 0, langd - 1);
          bil.bort = true;
          break;
        }
        langd = n.start[bil.e + 1] - n.start[bil.e];
        bil.s = bil.hall > 0 ? Math.min(over, langd - 1) : Math.max(langd - 1 - over, 0);
        if (bil.haller >= 0) bil.forbi = over * n.steg; // den är igenom korsningen den höll
        bil.vantat = 0;
        vakt += 1;
      }
      const vid = n.start[bil.e] + Math.round(mellan(bil.s, 0, langd - 1));
      // synlig eller dold bakom ett hus: bilen tonas över en bråkdel av en sekund
      if (!bil.bort) bil.alfa += ((n.syns[vid] ? 1 : 0) - bil.alfa) * Math.min(1, dt * 6);
      if (n.syns[vid] && inom(vy, n.x[vid], n.y[vid])) bil.syn += dt;
      else noteraLopp(bil);
      if (iOmradet(n.x[vid], n.y[vid])) bil.ute = 0;
      else {
        bil.ute += dt;
        if (bil.ute > 0.4) {
          taBort(i);
          kvar -= 1;
        }
      }
    }
    // Påfyllning. Medan området är nästan tomt (rutan har hoppat, eller kartan zoomades just in)
    // ställs bilar var som helst och tonas in. När det väl är befolkat börjar nya utom synhåll
    // och kör in.
    const satt = kvar >= 0.7 * urval.mal;
    const plats = Math.min(satt ? 12 : 120, urval.mal - kvar);
    for (let k = 0; k < plats; k += 1) {
      const ny = nyBil(n, vy, satt);
      if (ny) bilar.push(ny);
    }
    gallra(n, vy, kvar);
  }

  /** Ett fordon i tre led: kaross med sidor, hytt med glas, lyktor. Mitten och riktningen är redan satta med stallRit(). */
  function ritaFordon(bil: Bil, k: number) {
    const p = penna;
    const F = bil.langd / 2;
    const Bd = bil.bredd / 2;
    const lack = bil.lack;
    const fin = k > 2.4; // lyktor och annat smått syns först nära
    skuggruta(p, -F, F, -Bd, Bd, bil.hojd * 0.75);
    if (bil.sort === BUSS) {
      lada3(p, -F, F, -Bd, Bd, 0.3, 3.05, '#e4e7ea', skugga(lack, 1), skugga(lack, 0.74));
      langband(p, -F + 0.5, F - 0.5, Bd, 1.45, 2.45, GLAS);
      kortband(p, F, true, -Bd + 0.15, Bd - 0.15, 1.25, 2.55, GLAS);
      kortband(p, -F, false, -Bd + 0.3, Bd - 0.3, 1.6, 2.5, GLAS);
      if (fin) {
        kortband(p, F, true, -0.8, 0.8, 2.62, 2.92, '#f0b429'); // skylten med linjens nummer
        lyktor(p, F, Bd, 0.6);
      }
      lada3(p, -F * 0.55, -F * 0.15, -0.65, 0.65, 3.05, 3.3, '#cfd3d7', '#c3c8cd', '#a9aeb4');
    } else if (bil.sort === LASTBIL) {
      const skap = () => lada3(p, -F, F * 0.42, -Bd, Bd, 0.9, 3.3, '#eceae4', '#e2e0d9', '#bdbbb4');
      const hytt = () => {
        lada3(p, F * 0.5, F, -Bd, Bd, 0.3, 2.5, skugga(lack, 1.1), skugga(lack, 0.95), skugga(lack, 0.7));
        langband(p, F * 0.62, F * 0.94, Bd, 1.5, 2.2, GLAS);
        kortband(p, F, true, -Bd + 0.15, Bd - 0.15, 1.45, 2.25, GLAS);
        if (fin) lyktor(p, F, Bd, 0.55);
      };
      // den del som är närmast kameran ritas sist
      if (RDF > 0) {
        hytt();
        skap();
      } else {
        skap();
        hytt();
      }
    } else if (bil.sort === SKAPBIL) {
      lada3(p, -F, F, -Bd, Bd, 0.25, 1.95, skugga(lack, 1.08), skugga(lack, 0.94), skugga(lack, 0.7));
      langband(p, F * 0.3, F * 0.84, Bd, 1.15, 1.72, GLAS);
      kortband(p, F, true, -Bd + 0.15, Bd - 0.15, 1.1, 1.75, GLAS);
      if (fin) lyktor(p, F, Bd, 0.5);
    } else {
      lada3(p, -F, F, -Bd, Bd, 0.22, 0.82, skugga(lack, 1.04), skugga(lack, 0.9), skugga(lack, 0.68));
      if (fin) lyktor(p, F, Bd, 0.42);
      // hytten sitter lite bakom mitten: glas runt om och lackat tak
      lada3(p, -F * 0.68, F * 0.3, -Bd * 0.86, Bd * 0.86, 0.82, 1.38, skugga(lack, 1.14), GLAS_LJUST, GLAS);
      if (bil.sort === TAXI) lada3(p, -F * 0.32, -F * 0.1, -0.32, 0.32, 1.38, 1.58, '#f6d24a', '#f2c230', '#c99b14');
    }
  }

  function ritaBilar(vy: Vy) {
    if (!vagar || !bilar.length) return;
    const n = vagar;
    const zoomtoning = mellan((BIL_MAX_MPP - vy.mpp) / BIL_TONING_MPP, 0, 1);
    if (zoomtoning <= 0) return;
    const t = tathet;
    const k = vy.skala / mpb; // skärmpunkter per meter, i sidled
    const lyft = k / ROT2; // skärmpunkter som en meter på höjden lyfter en sak
    for (const bil of bilar) {
      if (bil.alfa < 0.06) continue;
      const a = n.start[bil.e];
      const langd = n.start[bil.e + 1] - a;
      const s = mellan(bil.s, 0, langd - 1.001);
      const i0 = a + Math.floor(s);
      const i1 = Math.min(i0 + 1, a + langd - 1);
      const andel = s - Math.floor(s);
      const mx = n.x[i0] + (n.x[i1] - n.x[i0]) * andel;
      const my = n.y[i0] + (n.y[i1] - n.y[i0]) * andel;
      if (mx < vy.x0 - 80 || mx > vy.x1 + 80 || my < vy.y0 - 80 || my > vy.y1 + 80) continue;
      // färdriktningen på marken: längs bildens höger och bort från kameran
      const j0 = Math.max(a, i0 - 1);
      const j1 = Math.min(a + langd - 1, i1 + 1);
      let dr = (n.x[j1] - n.x[j0]) * bil.hall;
      let df = -(n.y[j1] - n.y[j0]) * ROT2 * bil.hall;
      const dl = Math.hypot(dr, df);
      if (dl < 1e-6) continue;
      dr /= dl;
      df /= dl;
      // Bilen vrider sig mot vägens riktning under en bråkdel av en sekund, i stället för att slå om i en korsning.
      if (bil.vriden >= 0) {
        const andelVrid = 1 - Math.exp(-(klocka - bil.vriden) * 9);
        const vr = bil.vr + (dr - bil.vr) * andelVrid;
        const vf = bil.vf + (df - bil.vf) * andelVrid;
        const vl = Math.hypot(vr, vf);
        if (vl > 0.2) {
          dr = vr / vl;
          df = vf / vl;
        }
      }
      bil.vr = dr;
      bil.vf = df;
      bil.vriden = klocka;
      // samma två riktningar i bilden: längs bilen, och åt dess höger
      const ax = dr;
      const ay = -df / ROT2;
      const bx = df;
      const by = dr / ROT2;
      const x = vy.ox + mx * vy.skala + bx * bil.sida * k;
      const y = vy.oy + my * vy.skala + by * bil.sida * k;
      const L = (bil.langd * k) / 2;
      const Bd = (bil.bredd * k) / 2;
      penna.globalAlpha = mellan(bil.alfa, 0, 1) * zoomtoning;
      if (L < 1.6) {
        penna.fillStyle = bil.lack;
        penna.fillRect(x - 1, y - 1.5, 2, 2);
        continue;
      }
      if (L >= 3.2) {
        // nära nog för en modell med sidor och glas
        stallRit(x, y, dr, df, k);
        ritaFordon(bil, k);
        continue;
      }
      // längre ut: skuggan på vägen, karossen och taket som tre plattor
      penna.setTransform(t * ax * (L + 0.6), t * ay * (L + 0.6), t * bx * (Bd + 0.6), t * by * (Bd + 0.6), t * (x + 0.5), t * (y + 0.6));
      penna.fillStyle = 'rgba(8,12,20,0.38)';
      penna.fillRect(-1, -1, 2, 2);
      penna.setTransform(t * ax * L, t * ay * L, t * bx * Bd, t * by * Bd, t * x, t * (y - 0.45 * lyft));
      penna.fillStyle = skugga(bil.lack, 0.78);
      penna.fillRect(-1, -1, 2, 2);
      penna.setTransform(t * ax * L, t * ay * L, t * bx * Bd, t * by * Bd, t * x, t * (y - bil.hojd * lyft));
      penna.fillStyle = bil.sort === BUSS ? '#e4e7ea' : bil.lack;
      penna.fillRect(-1, -1, 2, 2);
      penna.setTransform(t, 0, 0, t, 0, 0);
    }
    penna.setTransform(t, 0, 0, t, 0, 0);
    penna.globalAlpha = 1;
  }

  /* ---------- varje bildruta ---------- */

  function passa() {
    const r = val.ruta();
    const nyTathet = Math.min(window.devicePixelRatio || 1, 2);
    if (r.bredd !== B || r.hojd !== H || nyTathet !== tathet) {
      B = r.bredd;
      H = r.hojd;
      tathet = nyTathet;
      duk.width = Math.max(1, Math.round(B * tathet));
      duk.height = Math.max(1, Math.round(H * tathet));
    }
  }

  /** Ritar lagret som det står, där kartbilden ligger just nu. Inget rör sig här, så det kan göras flera gånger i en bildruta. */
  function rita(franKartan: boolean) {
    passa();
    penna.setTransform(tathet, 0, 0, tathet, 0, 0);
    penna.clearRect(0, 0, B, H);
    const vy = vyNu();
    if (!vy) return;
    if (franKartan) rakning.medKartan += 1;
    else rakning.egna += 1;
    // En del får veta om bildvisaren just har ritat (träden och vattnet kopierar dess bild då).
    for (const del of delar) del.rita(vy, franKartan);
    penna.setTransform(tathet, 0, 0, tathet, 0, 0);
    ritaBilar(vy);
    ritaFaglar(vy);
    // det som flyger ligger över allt annat
    for (const del of delar) del.ritaOver?.(vy);
    penna.setTransform(tathet, 0, 0, tathet, 0, 0);
    penna.globalAlpha = 1;
  }

  function bildruta(nu: number) {
    slinga = requestAnimationFrame(bildruta);
    const glapp = nu - senast; // millisekunder sedan bildrutan före
    const dt = mellan(glapp / 1000, 0, 0.1);
    senast = nu;
    klocka += dt;
    passa();
    const borjan = performance.now();
    const vy = vyNu();
    if (vy) {
      stegBilar(dt, vy);
      for (const del of delar) del.steg(dt, vy);
      stegFaglar(dt, vy);
    }
    rita(false);
    hallTakten(glapp, dt, performance.now() - borjan);
  }

  /**
   * Håller takten: går ner en nivå när bildrutorna kommer långsamt, och upp igen när de har
   * kommit lätt en stund. Ett långt glapp är en dold flik eller ett hack, inte en långsam dator.
   */
  function hallTakten(glapp: number, dt: number, arbete: number) {
    if (glapp > 250 || document.hidden) return;
    takt.ruta += (glapp - takt.ruta) * 0.06;
    takt.arbete += (arbete - takt.arbete) * 0.06;
    // 30 ms mellan bildrutorna är 33 i sekunden. Mellan det och 21 ms ändras inget: en webbläsare
    // som går i 45 i sekunden utan lagret ska inte förlora sina träd för det.
    if (takt.ruta > 30) {
      takt.trogt += dt;
      takt.latt = 0;
    } else if (takt.ruta < 21) {
      takt.latt += dt;
      takt.trogt = Math.max(0, takt.trogt - dt);
    } else {
      takt.latt = 0;
      takt.trogt = Math.max(0, takt.trogt - dt);
    }
    if (takt.trogt > 2.5 && niva > 1) {
      niva -= 1;
      takt.steg += 1;
      if (takt.steg >= 2) tak = niva; // den högre nivån har prövats två gånger
      takt.trogt = 0;
      takt.ruta = 17;
      urval.alder = 9;
    } else if (takt.latt > 30 && niva < tak) {
      niva += 1;
      takt.latt = 0;
      urval.alder = 9;
    }
  }

  function tom() {
    tomBilar();
    flockar = [];
    for (const del of delar) del.rensa();
    passa();
    penna.setTransform(tathet, 0, 0, tathet, 0, 0);
    penna.clearRect(0, 0, B, H);
  }

  return {
    oppna(ny) {
      stad = ny;
      vagar = null;
      tomBilar();
      omrade = null;
      urval.alder = 9;
      urval.nyckel = '';
      flockar = [];
      fragat = {};
      for (const del of delar) del.oppna(ny);
    },
    satt(varde) {
      if (varde === pa) return;
      pa = varde;
      if (pa) {
        senast = performance.now();
        slinga = requestAnimationFrame(bildruta);
      } else {
        cancelAnimationFrame(slinga);
        slinga = 0;
        tom();
      }
    },
    ritaMedKartan() {
      if (pa) rita(true);
    },
    tryck(x, y) {
      const vy = pa ? vyNu() : null;
      if (!vy) return null;
      for (const del of delar) {
        const svar = del.tryck?.(x, y, vy);
        if (svar) return svar;
      }
      return null;
    },
    pask() {
      if (!pa) return false;
      let gick = false;
      for (const del of delar) gick = del.pask?.() === true || gick;
      return gick;
    },
    tillstand() {
      const vy = vyNu();
      let synliga = 0;
      let vantar = 0;
      if (vy && vagar) {
        for (const bil of bilar) {
          const vid = platsAv(vagar, bil);
          if (vagar.x[vid] > vy.x0 && vagar.x[vid] < vy.x1 && vagar.y[vid] > vy.y0 && vagar.y[vid] < vy.y1) synliga += 1;
          if (bil.vantat > 0) vantar += 1;
        }
      }
      const mer: Record<string, unknown> = {};
      for (const del of delar) Object.assign(mer, del.tillstand());
      const tider = Array.from(lopp.subarray(0, Math.min(loppantal, lopp.length))).sort((a, b) => a - b);
      // för den som ser på en bil just nu: hur länge den syns i ett sträck, vägt med tiden
      let halva = tider.reduce((a, b) => a + b, 0) / 2;
      let vagd = 0;
      for (const tid of tider) {
        vagd = tid;
        halva -= tid;
        if (halva <= 0) break;
      }
      return {
        pa,
        stad: stad?.id ?? null,
        niva,
        rutaMs: Math.round(takt.ruta * 10) / 10,
        arbeteMs: Math.round(takt.arbete * 100) / 100,
        mpp: vy ? Math.round(vy.mpp * 100) / 100 : null,
        bilar: bilar.length,
        bilarIRutan: synliga,
        bilmal: urval.mal,
        // bilar som står och väntar på en korsning, och korsningar som en bil håller
        vantar,
        korsningar: las.size,
        ...handelser,
        // hur länge en bil syns i ett sträck, i sekunder: medianen av de senaste gångerna, samma
        // sak för den bil man råkar se på (vägt med tiden), och hur många gånger som är mätta
        syntes: tider.length ? Math.round(tider[tider.length >> 1] * 10) / 10 : null,
        foljs: tider.length ? Math.round(vagd * 10) / 10 : null,
        lopp: loppantal,
        flockar: flockar.length,
        vagar: vagar ? vagar.E : 0,
        ritat: { ...rakning },
        ...mer,
      };
    },
  };
}
