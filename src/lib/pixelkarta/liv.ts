/**
 * Det som rör sig i en pixelstad: bilar, bussar och lastbilar på vägnätet, fågelflockar, tåg,
 * tunnelbana och spårvagnar på sina spår, färjor på sina linjer och småbåtar på öppet vatten.
 * Träd och vatten som rör sig ligger i liv-pixlar.ts.
 *
 * Allt ritas i kod på en duk som ligger över bildvisaren och under kartbilden, så att det syns
 * genom gluggen tillsammans med staden och sajtens prickar och namn ligger kvar överst. Platser
 * hålls i kartbildens egna punkter, så att allt följer med när kartan flyttas eller zoomas.
 *
 * Pixelkartans kamera ser 45 grader nedåt. En meter på marken är då 1 / (meter per bildpunkt)
 * bildpunkter i sidled och 1 / roten ur 2 av det uppåt i bilden, och en meter på höjden lyfter
 * en sak lika mycket.
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
 */
import type OpenSeadragon from 'openseadragon';
import type { Livsfiler, Livsnat } from './geometri';

/** Staden som är öppen i bildvisaren. */
export interface Livsstad {
  id: string;
  /** Kartbildens riktning i grader: 0 är norr uppåt. */
  riktning: number;
  bredd: number;
  filer: Livsfiler;
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
}
export interface Liv {
  /** En stads kartbild har öppnats i bildvisaren. */
  oppna(stad: Livsstad): void;
  /** Rörelsen på eller av. Av står allt still och dukarna är tomma. */
  satt(pa: boolean): void;
  /** Bildvisaren har just ritat: rita lagret där kartbilden ligger nu. */
  ritaMedKartan(): void;
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
const FART = [24, 14.5, 13, 11.5, 8]; // meter per sekund
const LUCKA = [38, 60, 85, 120, 210]; // meter väg per bil
const LACK = ['#f2f0ea', '#d9dde2', '#b9bec6', '#2b2e34', '#3b4048', '#8a1f1f', '#c0392b', '#1f4f8a', '#2e6da4', '#3d6b4a', '#c9a227', '#6b6f78', '#f2f0ea', '#d9dde2', '#2b2e34'];
const BILANDEL = [0, 0.25, 0.5, 1];

const mellan = (v: number, lag: number, hog: number): number => (v < lag ? lag : v > hog ? hog : v);

function skuggad(hex: string, faktor: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = mellan(Math.round(((n >> 16) & 255) * faktor), 0, 255);
  const g = mellan(Math.round(((n >> 8) & 255) * faktor), 0, 255);
  const b = mellan(Math.round((n & 255) * faktor), 0, 255);
  return `rgb(${r},${g},${b})`;
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
  return { E, S, steg: b.stepMeters, start, fran, till, x, y, info, syns, utStart: antal, ut, celler, stampel: new Uint32Array(E), varv: 0 };
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

/**
 * En låda som står på marken: dess grundyta är `langd` gånger `bredd` meter runt (x, y) på
 * skärmen, vriden längs (dr, df) på marken, och den ritas `hojd` meter upp.
 */
function lada(v: Verktyg, vy: Vy, x: number, y: number, dr: number, df: number, langd: number, bredd: number, hojd: number, farg: string) {
  const t = v.ruta().tathet;
  const k = vy.skala / v.mpb;
  const L = Math.max((langd * k) / 2, 0.6);
  const B = Math.max((bredd * k) / 2, 0.6);
  v.penna.setTransform(t * dr * L, t * (-df / ROT2) * L, t * df * B, t * (dr / ROT2) * B, t * x, t * (y - (hojd * k) / ROT2));
  v.penna.fillStyle = farg;
  v.penna.fillRect(-1, -1, 2, 2);
}

/** Ett skrov sett uppifrån, spetsigt i fören: fem hörn, `langd` gånger `bredd` meter. */
function skrov(v: Verktyg, vy: Vy, x: number, y: number, dr: number, df: number, langd: number, bredd: number, hojd: number, farg: string) {
  const p = v.penna;
  const t = v.ruta().tathet;
  const k = vy.skala / v.mpb;
  const L = Math.max((langd * k) / 2, 0.8);
  const B = Math.max((bredd * k) / 2, 0.6);
  p.setTransform(t * dr * L, t * (-df / ROT2) * L, t * df * B, t * (dr / ROT2) * B, t * x, t * (y - (hojd * k) / ROT2));
  p.fillStyle = farg;
  p.beginPath();
  p.moveTo(-1, -0.82);
  p.lineTo(0.45, -1);
  p.lineTo(1, 0);
  p.lineTo(0.45, 1);
  p.lineTo(-1, 0.82);
  p.closePath();
  p.fill();
}

/** Det vita V som en båt i rörelse lämnar efter sig. */
function kolvatten(v: Verktyg, vy: Vy, x: number, y: number, dr: number, df: number, langd: number, bredd: number, rackvidd: number, styrka: number) {
  if (styrka <= 0.02) return;
  const p = v.penna;
  const t = v.ruta().tathet;
  const k = vy.skala / v.mpb;
  p.setTransform(t, 0, 0, t, 0, 0);
  // en meter framåt och en meter åt höger, på skärmen
  const ax = dr * k;
  const ay = (-df / ROT2) * k;
  const bx = df * k;
  const by = (dr / ROT2) * k;
  // aktern
  const sx = x - ax * langd * 0.45;
  const sy = y - ay * langd * 0.45;
  p.strokeStyle = `rgba(235,246,250,${(0.55 * styrka).toFixed(3)})`;
  p.lineWidth = Math.max(1, bredd * k * 0.22);
  p.lineCap = 'round';
  p.beginPath();
  for (let sida = -1; sida <= 1; sida += 2) {
    p.moveTo(sx + bx * sida * bredd * 0.3, sy + by * sida * bredd * 0.3);
    p.lineTo(sx - ax * rackvidd + bx * sida * (bredd * 0.3 + rackvidd * 0.28), sy - ay * rackvidd + by * sida * (bredd * 0.3 + rackvidd * 0.28));
  }
  p.stroke();
  // det upprörda vattnet precis bakom aktern
  p.strokeStyle = `rgba(235,246,250,${(0.35 * styrka).toFixed(3)})`;
  p.lineWidth = Math.max(1, bredd * k * 0.5);
  p.beginPath();
  p.moveTo(sx, sy);
  p.lineTo(sx - ax * rackvidd * 0.45, sy - ay * rackvidd * 0.45);
  p.stroke();
}

/* ---------- tåg, tunnelbana och spårvagnar ---------- */

function tagdel(v: Verktyg): Del {
  type Sort = { fart: number; vagnar: number; vagnslangd: number; perKm: number; tak: string; sida: string };
  // per sorts spår: tunnelbana, järnväg, lätt spårväg, spårvagn, smalspår
  const SORT: Sort[] = [
    { fart: 17, vagnar: 6, vagnslangd: 23, perKm: 1 / 1.7, tak: '#2f62a8', sida: '#dfe5ec' },
    { fart: 23, vagnar: 6, vagnslangd: 26, perKm: 1 / 2.4, tak: '#d6dade', sida: '#3a5682' },
    { fart: 12, vagnar: 3, vagnslangd: 15, perKm: 1 / 1.5, tak: '#e9ecef', sida: '#3c6fb0' },
    { fart: 9, vagnar: 3, vagnslangd: 10, perKm: 1 / 1.0, tak: '#e9ecef', sida: '#2f62a8' },
    { fart: 15, vagnar: 4, vagnslangd: 20, perKm: 1 / 1.9, tak: '#e4e7ea', sida: '#a33a2c' },
  ];
  const MAX_MPP = 4.5;
  const BREDD = 3.0;
  const KOPPEL = 0.8;
  const TAK = 40;
  type Tag = { sort: Sort; vag: number[]; kant: number; slut: boolean; ute: number; h: number; fart: number };
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

  return {
    oppna() {
      nat = null;
      tagen = [];
      urval = null;
      alder = 9;
      fragat = false;
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
      const t = v.ruta().tathet;
      const nara = vidgad(vy, 0.1);
      p.globalAlpha = toning;
      for (const tag of tagen) {
        const sort = tag.sort;
        for (let c = 0; c < sort.vagnar; c += 1) {
          const q = tag.h - (c * (sort.vagnslangd + KOPPEL) + sort.vagnslangd / 2) / n.steg;
          if (q < 1 || q > tag.vag.length - 2) continue; // inte ute ur tunneln än, eller redan inne
          const j = Math.floor(q);
          const andel = q - j;
          const s0 = tag.vag[j];
          const s1 = tag.vag[j + 1];
          if (!n.syns[andel < 0.5 ? s0 : s1]) continue;
          const mx = n.x[s0] + (n.x[s1] - n.x[s0]) * andel;
          const my = n.y[s0] + (n.y[s1] - n.y[s0]) * andel;
          if (!inom(nara, mx, my)) continue;
          // vagnen pekar längs spåret en bit bakom och framför sin mitt
          const sa = tag.vag[Math.max(0, j - 2)];
          const sb = tag.vag[Math.min(tag.vag.length - 1, j + 3)];
          let dr = n.x[sb] - n.x[sa];
          let df = -(n.y[sb] - n.y[sa]) * ROT2;
          const dl = Math.hypot(dr, df);
          if (dl < 1e-6) continue;
          dr /= dl;
          df /= dl;
          const x = vy.ox + mx * vy.skala;
          const y = vy.oy + my * vy.skala;
          lada(v, vy, x + 0.6, y + 0.8, dr, df, sort.vagnslangd + 0.6, BREDD + 0.8, 0, 'rgba(8,12,20,0.4)');
          lada(v, vy, x, y, dr, df, sort.vagnslangd, BREDD, 0.9, v.skugga(sort.sida, 0.72));
          lada(v, vy, x, y, dr, df, sort.vagnslangd, BREDD, 2.2, sort.sida);
          lada(v, vy, x, y, dr, df, sort.vagnslangd - 0.6, BREDD, 3.0, '#1c2430');
          lada(v, vy, x, y, dr, df, sort.vagnslangd - 0.4, BREDD - 0.3, 3.7, sort.tak);
        }
      }
      p.setTransform(t, 0, 0, t, 0, 0);
      p.globalAlpha = 1;
    },
    tillstand: () => ({ tag: tagen.length, tagmal: mal, spar: nat ? nat.E : 0 }),
  };
}

/* ---------- färjor ---------- */

function farjedel(v: Verktyg): Del {
  type Sort = { fart: number; langd: number; bredd: number; perKm: number; skrov: string; dack: string; hus: string; hushojd: number; skorsten: string };
  // en pendelbåt, och ett fartyg till Finland eller Baltikum
  const SORT: Sort[] = [
    { fart: 5.5, langd: 30, bredd: 8, perKm: 1 / 1.6, skrov: '#f4f2ec', dack: '#d8dde2', hus: '#fbfaf6', hushojd: 6, skorsten: '' },
    { fart: 8.5, langd: 185, bredd: 29, perKm: 1 / 9, skrov: '#f1f1ee', dack: '#cfd5db', hus: '#fbfaf6', hushojd: 26, skorsten: '#c0392b' },
  ];
  const MAX_MPP = 3.6;
  const TAK = 24;
  type Farja = { e: number; hall: number; s: number; sort: Sort; fart: number; kaj: number; ute: number };
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
      const sort = sortAv(n, e);
      return { e, hall: Math.random() < 0.5 ? 1 : -1, s, sort, fart: sort.fart * (0.9 + 0.2 * Math.random()), kaj: 0, ute: 0 };
    }
    return null;
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
      const t = v.ruta().tathet;
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
        if (!n.syns[andel < 0.5 ? i0 : i1]) continue; // under en bro
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
        p.globalAlpha = toning;
        if (f.kaj <= 0) kolvatten(v, vy, x, y, dr, df, sort.langd, sort.bredd, sort.langd * 1.6, toning);
        p.globalAlpha = toning;
        skrov(v, vy, x, y, dr, df, sort.langd, sort.bredd, 0.4, v.skugga(sort.skrov, 0.7));
        skrov(v, vy, x, y, dr, df, sort.langd, sort.bredd, 2.2, sort.skrov);
        skrov(v, vy, x, y, dr, df, sort.langd * 0.96, sort.bredd * 0.86, 2.6, sort.dack);
        // huset på däck, lite akter om mitten
        const hx = x - dr * sort.langd * 0.08 * k;
        const hy = y + (df / ROT2) * sort.langd * 0.08 * k;
        lada(v, vy, hx, hy, dr, df, sort.langd * 0.6, sort.bredd * 0.66, 2.6 + sort.hushojd * 0.5, '#27303c');
        lada(v, vy, hx, hy, dr, df, sort.langd * 0.6, sort.bredd * 0.66, 2.6 + sort.hushojd, sort.hus);
        if (sort.skorsten) {
          const fx = x - dr * sort.langd * 0.26 * k;
          const fy = y + (df / ROT2) * sort.langd * 0.26 * k;
          lada(v, vy, fx, fy, dr, df, sort.langd * 0.07, sort.bredd * 0.3, 2.6 + sort.hushojd + 9, sort.skorsten);
        }
      }
      p.setTransform(t, 0, 0, t, 0, 0);
      p.globalAlpha = 1;
    },
    tillstand: () => ({ farjor: farjor.length, farjemal: mal, farjelinjer: nat ? nat.E : 0 }),
  };
}

/* ---------- småbåtar på öppet vatten ---------- */

function batdel(v: Verktyg): Del {
  const MAX_MPP = 2.4;
  const TONING_MPP = 0.6;
  const TAK = 70;
  const KVADRATMETER_PER_BAT = 60000; // en båt per sex hektar öppet vatten
  const UTANFOR = 0.6;
  type Vatten = { b: number; h: number; bitar: Uint8Array; cell: number };
  type Bat = { x: number; y: number; th: number; svang: number; styr: number; segel: boolean; fart: number; langd: number; lack: string; alfa: number; ute: number };
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
      const segel = Math.random() < 0.4;
      return {
        x,
        y,
        th: Math.random() * Math.PI * 2,
        svang: 0,
        styr: 0,
        segel,
        fart: segel ? 2.2 + 1.3 * Math.random() : 5 + 6 * Math.random(),
        langd: segel ? 8 + 3 * Math.random() : 5.5 + 3 * Math.random(),
        lack: Math.random() < 0.75 ? '#f6f4ee' : Math.random() < 0.5 ? '#2b4a78' : '#7a2f28',
        alfa: dold ? 1 : 0,
        ute: 0,
      };
    }
    return null;
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
      for (let i = batar.length - 1; i >= 0; i -= 1) {
        const b = batar[i];
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
        b.x = nasta.x;
        b.y = nasta.y;
        b.alfa += (1 - b.alfa) * Math.min(1, dt * 2);
        let borta = !arVatten(b.x, b.y); // den har gått på grund i den grova vattenbilden
        if (inom(omrade, b.x, b.y)) b.ute = 0;
        else {
          b.ute += dt;
          if (b.ute > 0.5) borta = true;
        }
        if (borta) {
          batar[i] = batar[batar.length - 1];
          batar.pop();
        }
      }
      const satt = batar.length >= 0.7 * mal;
      for (let k = Math.min(satt ? 2 : 30, mal - batar.length); k > 0; k -= 1) {
        const ny = nyBat(vy, satt);
        if (ny) batar.push(ny);
      }
    },
    rita(vy) {
      if (!vatten || !batar.length) return;
      const toning = mellan((MAX_MPP - vy.mpp) / TONING_MPP, 0, 1);
      if (toning <= 0) return;
      const p = v.penna;
      const t = v.ruta().tathet;
      const k = vy.skala / v.mpb;
      const lyft = k / ROT2;
      for (const b of batar) {
        if (!inom(vy, b.x, b.y)) continue;
        const x = vy.ox + b.x * vy.skala;
        const y = vy.oy + b.y * vy.skala;
        const dr = Math.cos(b.th);
        const df = Math.sin(b.th);
        const bredd = b.langd * 0.33;
        p.globalAlpha = toning * b.alfa;
        kolvatten(v, vy, x, y, dr, df, b.langd, bredd, b.segel ? b.langd * 0.8 : b.langd * (1.2 + b.fart * 0.25), toning * b.alfa * (b.segel ? 0.5 : 1));
        p.globalAlpha = toning * b.alfa;
        skrov(v, vy, x, y, dr, df, b.langd, bredd, 0.2, v.skugga(b.lack, 0.68));
        skrov(v, vy, x, y, dr, df, b.langd, bredd, 0.8, b.lack);
        if (b.segel) {
          // seglet står upp från däcket: mastfot, masttopp och bommens ände
          p.setTransform(t, 0, 0, t, 0, 0);
          const mastX = x + dr * b.langd * 0.1 * k;
          const mastY = y - (df / ROT2) * b.langd * 0.1 * k - 1.0 * lyft;
          const bomX = x - dr * b.langd * 0.42 * k;
          const bomY = y + (df / ROT2) * b.langd * 0.42 * k - 1.6 * lyft;
          p.fillStyle = '#fbfaf4';
          p.strokeStyle = 'rgba(40,52,66,0.55)';
          p.lineWidth = Math.max(0.6, 0.12 * k);
          p.beginPath();
          p.moveTo(mastX, mastY);
          p.lineTo(mastX, mastY - b.langd * 1.15 * lyft);
          p.lineTo(bomX, bomY);
          p.closePath();
          p.fill();
          p.stroke();
        } else {
          // en vindruta och en liten ruff
          lada(v, vy, x + dr * b.langd * 0.05 * k, y - (df / ROT2) * b.langd * 0.05 * k, dr, df, b.langd * 0.3, bredd * 0.7, 1.5, '#27303c');
        }
      }
      p.setTransform(t, 0, 0, t, 0, 0);
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
  /** Fler delar, som får lagrets verktyg (träd och vatten som rör sig). */
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

  type Fagel = { langs: number; tvars: number; fas: number; takt: number };
  type Flock = { x: number; y: number; vx: number; vy: number; faglar: Fagel[]; lyft: number; liv: number };
  type Bil = {
    e: number;
    hall: number;
    s: number;
    fart: number;
    fil: number;
    langd: number;
    bredd: number;
    hojd: number;
    lack: string;
    ladformad: boolean;
    alfa: number;
    ute: number;
    rum: number; // hur långt den får gå i den här bildrutan innan den är för nära bilen framför
    haller: number; // korsningen den har, om någon
    forbi: number; // meter körda sedan den gick genom den korsningen
    vantat: number; // sekunder den har stått och väntat på en korsning
    dod: boolean;
  };
  let flockar: Flock[] = [];
  let vagar: Nat | null = null;
  let bilar: Bil[] = [];
  const urval = { kanter: [] as number[], vikter: [] as number[], totalt: 0, mal: 0, alder: 9, nyckel: '' };
  let omrade: Omrade | null = null; // där bilar hålls, i bildpunkter
  let las = new Map<number, Bil>(); // korsning -> bilen som har den
  let fragat: Record<string, boolean> = {};
  // hur ofta lagret ritades i sin egen takt och i kartans bildruta
  const rakning = { egna: 0, medKartan: 0 };

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
   * En flock som ska korsa rutan. Med `redan` är den någonstans på väg genom rutan från början,
   * annars börjar den utanför, på den sida den flyger in från.
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
    const flock: Flock = { x: cx - vx * bak, y: cy - vyy * bak, vx, vy: vyy, faglar: [], lyft: (30 + 50 * slump()) / (ROT2 * mpb), liv: 0 };
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
   * en mörk kant, och den vita fågeln, så att den syns över vatten, tak och träd.
   */
  function ritaFaglar(vy: Vy) {
    if (!flockar.length) return;
    const vinge = VINGE / vy.mpp; // skärmpunkter
    const toning = mellan((vinge - VINGE_MINST) / 1.2, 0, 1);
    if (toning <= 0) return;
    penna.globalAlpha = toning;
    penna.lineCap = 'round';
    penna.lineJoin = 'round';
    const varv = [
      { farg: 'rgba(6,12,20,0.30)', bredd: vinge * 0.42, lyft: false },
      { farg: 'rgba(14,22,34,0.85)', bredd: vinge * 0.46 + Math.min(1.6, vinge * 0.3), lyft: true },
      { farg: '#fbf9f2', bredd: vinge * 0.46, lyft: true },
    ];
    for (const v of varv) {
      penna.strokeStyle = v.farg;
      penna.lineWidth = Math.max(1, v.bredd);
      penna.beginPath();
      for (const f of flockar) {
        const fart = Math.hypot(f.vx, f.vy);
        const ux = f.vx / fart;
        const uy = f.vy / fart;
        for (const fagel of f.faglar) {
          const x = vy.ox + f.x * vy.skala + (ux * fagel.langs - uy * fagel.tvars) * vinge;
          const y = vy.oy + f.y * vy.skala + (uy * fagel.langs + ux * fagel.tvars) * vinge - (v.lyft ? f.lyft * vy.skala : 0);
          if (x < -30 || y < -30 || x > B + 30 || y > H + 30) continue;
          const slag = Math.sin(klocka * fagel.takt + fagel.fas); // vingarna upp och ner
          const dopp = vinge * (0.1 + 0.5 * slag);
          // kroppen, ett kort streck längs flykten
          penna.moveTo(x - ux * vinge * 0.3, y - uy * vinge * 0.3);
          penna.lineTo(x + ux * vinge * 0.2, y + uy * vinge * 0.2);
          // vingarna, ut åt båda håll, böjda på mitten och svepta bakåt i spetsarna
          const bx = ux * vinge * 0.45;
          const by = uy * vinge * 0.45;
          penna.moveTo(x - uy * vinge - bx, y + ux * vinge * 0.7 - by - dopp);
          penna.quadraticCurveTo(x - uy * vinge * 0.45, y + ux * vinge * 0.3 - dopp * 1.3, x, y);
          penna.quadraticCurveTo(x + uy * vinge * 0.45, y - ux * vinge * 0.3 - dopp * 1.3, x + uy * vinge - bx, y - ux * vinge * 0.7 - by - dopp);
        }
      }
      penna.stroke();
    }
    penna.globalAlpha = 1;
  }

  /* ---------- vägar och bilar ---------- */

  const iOmradet = (x: number, y: number): boolean => !!omrade && inom(omrade, x, y);

  /** Kanterna i området där bilar hålls, och hur många bilar så mycket väg ska bära. */
  function fornyaUrval(n: Nat, vy: Vy) {
    omrade = vidgad(vy, OMRADE);
    const samlat = samla(n, omrade, (e, meter) => meter / LUCKA[n.info[e] & 7]);
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
      const buss = klass >= 1 && klass <= 3 && Math.random() < 0.05;
      const lastbil = !buss && klass <= 1 && Math.random() < 0.07;
      return {
        e,
        hall: enkelriktad || Math.random() < 0.5 ? 1 : -1,
        s,
        fart: FART[klass] * (0.82 + 0.3 * Math.random()),
        fil: enkelriktad ? (Math.random() < 0.5 ? -1.7 : 1.7) * (klass === 0 ? 1 : 0.6) : 1.7,
        langd: buss ? 12 : lastbil ? 8.5 : 4.3 + 0.5 * Math.random(),
        bredd: buss || lastbil ? 2.5 : 1.85,
        hojd: buss ? 3.0 : lastbil ? 2.9 : 1.45,
        lack: buss ? (Math.random() < 0.7 ? '#c0392b' : '#2e6da4') : lastbil ? '#e8e6df' : LACK[Math.floor(Math.random() * LACK.length)],
        ladformad: buss || lastbil,
        // en bil som börjar utom synhåll är hel direkt; en som ställs in i rutan tonas in
        alfa: iRutan && n.syns[vid] ? 0 : 1,
        ute: 0,
        rum: Infinity,
        haller: -1,
        forbi: -1,
        vantat: 0,
        dod: false,
      };
    }
    return null;
  }

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
      if (e === bil.e) continue; // ingen vänder om
      const dar = riktningVid(n, e, hall, false);
      const tl = Math.hypot(dar.x, dar.y) || 1;
      const rakt = (har.x * dar.x + har.y * dar.y) / (hl * tl);
      // mest rakt fram, och hellre in på en väg av samma slag
      const vikt = 0.08 + Math.max(0, rakt) ** 3 * ((n.info[e] & 7) === (n.info[bil.e] & 7) ? 2 : 1);
      val_.push(ref);
      totalt += vikt;
      vikter.push(totalt);
    }
    if (!val_.length) return false;
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
      bilar.length = 0;
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
    for (let i = bilar.length - 1; i >= 0; i -= 1) {
      const bil = bilar[i];
      let langd = n.start[bil.e + 1] - n.start[bil.e];
      let flytt = Math.min((bil.fart / n.steg) * dt, bil.rum);
      // I en korsning en bil i taget: den första inom 9 m har den tills den är 8 m förbi. De
      // andra stannar 4 m före. En som har väntat fem sekunder kör ändå, så att inget låser sig
      // för gott. Motorvägar vävs ihop utan det här.
      const nod = bil.hall > 0 ? n.till[bil.e] : n.fran[bil.e];
      const kvar = (bil.hall > 0 ? langd - 1 - bil.s : bil.s) * n.steg;
      if (kvar < 9 && bil.haller !== nod && (n.info[bil.e] & 7) > 0 && n.utStart[nod + 1] - n.utStart[nod] > 2) {
        const hallare = las.get(nod);
        if (!hallare || hallare.dod) {
          slappLas(bil);
          las.set(nod, bil);
          bil.haller = nod;
          bil.forbi = -1;
          bil.vantat = 0;
        } else if (bil.vantat < 5) {
          flytt = Math.min(flytt, Math.max(0, kvar - 4) / n.steg);
          bil.vantat += dt;
        }
      }
      bil.s += bil.hall * flytt;
      if (bil.forbi >= 0) {
        bil.forbi += flytt * n.steg;
        if (bil.forbi > 8) {
          slappLas(bil);
          bil.haller = -1;
          bil.forbi = -1;
        }
      }
      let borta = false;
      let vakt = 0;
      while ((bil.s > langd - 1 || bil.s < 0) && !borta && vakt < 4) {
        const over = bil.s > langd - 1 ? bil.s - (langd - 1) : -bil.s;
        if (!nastaKant(n, bil)) {
          borta = true;
          break;
        }
        langd = n.start[bil.e + 1] - n.start[bil.e];
        bil.s = bil.hall > 0 ? Math.min(over, langd - 1) : Math.max(langd - 1 - over, 0);
        if (bil.haller >= 0) bil.forbi = over * n.steg; // den är igenom korsningen den höll
        bil.vantat = 0;
        vakt += 1;
      }
      if (!borta) {
        const vid = n.start[bil.e] + Math.round(mellan(bil.s, 0, langd - 1));
        // synlig eller dold bakom ett hus: bilen tonas över en bråkdel av en sekund
        bil.alfa += ((n.syns[vid] ? 1 : 0) - bil.alfa) * Math.min(1, dt * 7);
        if (iOmradet(n.x[vid], n.y[vid])) bil.ute = 0;
        else {
          bil.ute += dt;
          if (bil.ute > 0.4) borta = true;
        }
      }
      if (borta) {
        bil.dod = true;
        slappLas(bil);
        bilar[i] = bilar[bilar.length - 1];
        bilar.pop();
      }
    }
    // Påfyllning. Medan området är nästan tomt (rutan har hoppat, eller kartan zoomades just in)
    // ställs bilar var som helst och tonas in. När det väl är befolkat börjar nya utom synhåll
    // och kör in.
    const satt = bilar.length >= 0.7 * urval.mal;
    const plats = Math.min(satt ? 12 : 120, urval.mal - bilar.length);
    for (let k = 0; k < plats; k += 1) {
      const ny = nyBil(n, vy, satt);
      if (ny) bilar.push(ny);
    }
    if (bilar.length > urval.mal + 80) bilar.length = urval.mal + 80;
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
      // samma två riktningar i bilden: längs bilen, och åt dess höger
      const ax = dr;
      const ay = -df / ROT2;
      const bx = df;
      const by = dr / ROT2;
      const x = vy.ox + mx * vy.skala + bx * bil.fil * k;
      const y = vy.oy + my * vy.skala + by * bil.fil * k;
      const L = (bil.langd * k) / 2;
      const Bd = (bil.bredd * k) / 2;
      penna.globalAlpha = bil.alfa * zoomtoning;
      if (L < 1.6) {
        penna.setTransform(t, 0, 0, t, 0, 0);
        penna.fillStyle = bil.lack;
        penna.fillRect(x - 1, y - 1.5, 2, 2);
        continue;
      }
      // skuggan på vägen, karossen, och hytten ovanpå
      penna.setTransform(t * ax * (L + 0.6), t * ay * (L + 0.6), t * bx * (Bd + 0.6), t * by * (Bd + 0.6), t * (x + 0.5), t * (y + 0.6));
      penna.fillStyle = 'rgba(8,12,20,0.38)';
      penna.fillRect(-1, -1, 2, 2);
      penna.setTransform(t * ax * L, t * ay * L, t * bx * Bd, t * by * Bd, t * x, t * (y - 0.45 * lyft));
      penna.fillStyle = skugga(bil.lack, 0.78);
      penna.fillRect(-1, -1, 2, 2);
      if (bil.ladformad) {
        penna.setTransform(t * ax * L, t * ay * L, t * bx * Bd, t * by * Bd, t * x, t * (y - bil.hojd * lyft));
        penna.fillStyle = bil.lack;
        penna.fillRect(-1, -1, 2, 2);
      } else {
        penna.setTransform(t * ax * L, t * ay * L, t * bx * Bd, t * by * Bd, t * x, t * (y - 0.85 * lyft));
        penna.fillStyle = bil.lack;
        penna.fillRect(-1, -1, 2, 2);
        // hytten sitter lite bakom mitten, med mörkt glas runt ett lackat tak
        penna.setTransform(t * ax * L, t * ay * L, t * bx * Bd, t * by * Bd, t * x, t * (y - bil.hojd * lyft));
        penna.fillStyle = 'rgba(18,24,34,0.92)';
        penna.fillRect(-0.62, -0.86, 1.1, 1.72);
        penna.fillStyle = skugga(bil.lack, 1.12);
        penna.fillRect(-0.42, -0.74, 0.7, 1.48);
      }
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
    penna.setTransform(tathet, 0, 0, tathet, 0, 0);
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
    bilar = [];
    flockar = [];
    las = new Map();
    for (const del of delar) del.rensa();
    passa();
    penna.setTransform(tathet, 0, 0, tathet, 0, 0);
    penna.clearRect(0, 0, B, H);
  }

  return {
    oppna(ny) {
      stad = ny;
      vagar = null;
      bilar = [];
      omrade = null;
      urval.alder = 9;
      urval.nyckel = '';
      flockar = [];
      las = new Map();
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
    tillstand() {
      const vy = vyNu();
      let synliga = 0;
      if (vy && vagar) {
        for (const bil of bilar) {
          const vid = vagar.start[bil.e] + Math.round(mellan(bil.s, 0, vagar.start[bil.e + 1] - vagar.start[bil.e] - 1));
          if (vagar.x[vid] > vy.x0 && vagar.x[vid] < vy.x1 && vagar.y[vid] > vy.y0 && vagar.y[vid] < vy.y1) synliga += 1;
        }
      }
      const mer: Record<string, unknown> = {};
      for (const del of delar) Object.assign(mer, del.tillstand());
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
        flockar: flockar.length,
        vagar: vagar ? vagar.E : 0,
        ritat: { ...rakning },
        ...mer,
      };
    },
  };
}
