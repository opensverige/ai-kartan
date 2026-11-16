/**
 * Det som rör sig i luften över en pixelstad, och ett påskägg på vattnet.
 *
 * - Luftballonger driver med vinden över staden. De hör till staden och inte till rutan: var och
 *   en har sin plats över kartbilden och finns där vare sig någon ser den eller inte, så den som
 *   har hittat en ballong kan följa den. Ett tryck på en ballong får den att elda och stiga.
 * - Ett litet flygplan drar då och då en banderoll över rutan, från öster till väster, så att
 *   texten går att läsa.
 * - I Stockholm seglar regalskeppet Vasa ut på Strömmen och sjunker utanför Beckholmen, som hon
 *   gjorde den 10 augusti 1628 efter 1 300 meter. Det händer en gång per besök, för den som
 *   tittar på det vattnet.
 *
 * Allt ritas över bilar och fåglar. Ballongerna och skeppet är bilder från bildtjänsten, när den
 * har några (`figures` i stadens filer): en stilla bild var, som rörs i kod. De pekar alltid åt
 * samma håll, så en bild räcker: en ballong är rund, och skeppet seglar en enda sträcka. Utan
 * bilder, och för flygplanet, ritas de i kod med lagrets ritning i tre led (liv.ts).
 */
import { type Del, type Verktyg, type Vy, stallRit, skX, skY, lada3, prisma, fyrkant, trekant, streck, langband, kortband } from './liv';

const ROT2 = Math.SQRT2;
const mellan = (v: number, lag: number, hog: number): number => (v < lag ? lag : v > hog ? hog : v);
type Penna = CanvasRenderingContext2D;

// Solen står i öster i kartbilden: en sak på höjden h kastar sin skugga så här långt åt väster och söder, i meter per meter.
const SKUGGA_VAST = 0.5;
const SKUGGA_SYD = 0.22;

/* ---------- figurer som är bilder ---------- */

/** En bild och dess halveringar, så att den inte flimrar när den ritas mycket mindre än den är. */
type Figur = { steg: CanvasImageSource[]; bredder: number[]; b: number; h: number };
// undefined: hämtas ännu. null: gick inte att hämta, och då ritas figuren i kod.
const figurlager = new Map<string, Figur | null | undefined>();

/** Figuren på en adress, hämtad en gång per besök. */
function figur(adress: string): Figur | null | undefined {
  if (figurlager.has(adress)) return figurlager.get(adress);
  figurlager.set(adress, undefined);
  const bild = new Image();
  bild.crossOrigin = 'anonymous';
  bild.onerror = () => figurlager.set(adress, null);
  bild.onload = () => {
    const steg: CanvasImageSource[] = [bild];
    const bredder = [bild.naturalWidth];
    let b = bild.naturalWidth;
    let h = bild.naturalHeight;
    let fran: CanvasImageSource = bild;
    while (b > 12) {
      b = Math.max(1, Math.round(b / 2));
      h = Math.max(1, Math.round(h / 2));
      const duk = document.createElement('canvas');
      duk.width = b;
      duk.height = h;
      const penna = duk.getContext('2d');
      if (!penna) break;
      penna.drawImage(fran, 0, 0, b, h);
      steg.push(duk);
      bredder.push(b);
      fran = duk;
    }
    figurlager.set(adress, { steg, bredder, b: bild.naturalWidth, h: bild.naturalHeight });
  };
  bild.src = adress;
  return undefined;
}

/** Ritar figuren i rutan (x, y, b, h) skärmpunkter, med den halvering som ligger närmast över storleken på skärmen. */
function ritaFigur(p: Penna, f: Figur, x: number, y: number, b: number, h: number, tathet: number) {
  let i = 0;
  while (i + 1 < f.steg.length && f.bredder[i + 1] >= b * tathet) i += 1;
  p.drawImage(f.steg[i], x, y, b, h);
}

/* ---------- ballonger ---------- */

const BALLONG_MAX_MPP = 9; // längre ut än så är en ballong under tre skärmpunkter
const BALLONGRADIE = 11; // meter: större än en riktig ballong, som fåglarna, så att den syns
const KVADRATKILOMETER_PER_BALLONG = 3;
// tre färger var: de två som växlar i våderna, och bandet runt mitten
const BALLONGFARGER: [string, string, string][] = [
  ['#d8362a', '#f2c230', '#f6f1e4'],
  ['#1f5fa8', '#f6f1e4', '#e0b62e'],
  ['#f6f1e4', '#e4572e', '#1c1a17'],
  ['#3d8b6b', '#f2c230', '#f6f1e4'],
  ['#7a3fa0', '#f6f1e4', '#f2c230'],
];
const VADER = [-1, -0.9, -0.63, -0.22, 0.22, 0.63, 0.9, 1];

type Ballong = { x: number; y: number; hojd: number; fas: number; farger: number; eld: number; extra: number };

/** En ballong med mitten i (cx, cy) och radien R skärmpunkter: höljet i våder, kjolen, linorna och korgen. */
function ritaBallong(p: Penna, cx: number, cy: number, R: number, farger: [string, string, string], eld: number, skugga: (hex: string, faktor: number) => string) {
  if (R < 2.6) {
    // långt ute: två halvor och en korg
    p.fillStyle = farger[0];
    p.beginPath();
    p.arc(cx, cy, R, 0, Math.PI * 2);
    p.fill();
    p.fillStyle = farger[1];
    p.fillRect(cx - R * 0.35, cy - R, R * 0.7, R * 2);
    p.fillStyle = '#5c3d22';
    p.fillRect(cx - 0.6, cy + R * 1.5, 1.2, 1.2);
    return;
  }
  // höljets halva kontur, från mynningen upp till toppen, hoptryckt i sidled med s
  const upp = (s: number) => {
    p.moveTo(cx + s * 0.2 * R, cy + 1.2 * R);
    p.bezierCurveTo(cx + s * 0.75 * R, cy + 0.75 * R, cx + s * R, cy + 0.35 * R, cx + s * R, cy - 0.05 * R);
    p.bezierCurveTo(cx + s * R, cy - 0.6 * R, cx + s * 0.55 * R, cy - R, cx, cy - R);
  };
  const ner = (s: number) => {
    p.bezierCurveTo(cx + s * 0.55 * R, cy - R, cx + s * R, cy - 0.6 * R, cx + s * R, cy - 0.05 * R);
    p.bezierCurveTo(cx + s * R, cy + 0.35 * R, cx + s * 0.75 * R, cy + 0.75 * R, cx + s * 0.2 * R, cy + 1.2 * R);
  };
  // linorna och korgen
  const korgY = cy + 1.58 * R;
  const korgB = 0.34 * R;
  const korgH = 0.26 * R;
  p.strokeStyle = 'rgba(40,34,26,0.8)';
  p.lineWidth = Math.max(0.5, R * 0.03);
  p.beginPath();
  p.moveTo(cx - 0.18 * R, cy + 1.22 * R);
  p.lineTo(cx - korgB / 2, korgY);
  p.moveTo(cx + 0.18 * R, cy + 1.22 * R);
  p.lineTo(cx + korgB / 2, korgY);
  p.stroke();
  p.fillStyle = '#7a5230';
  p.fillRect(cx - korgB / 2, korgY, korgB, korgH);
  p.fillStyle = '#5c3d22';
  p.fillRect(cx - korgB / 2, korgY, korgB * 0.38, korgH);
  p.fillStyle = '#a57645';
  p.fillRect(cx - korgB / 2, korgY, korgB, Math.max(0.6, korgH * 0.2));
  // lågan under mynningen, när brännaren går
  if (eld > 0) {
    p.fillStyle = `rgba(255,170,60,${mellan(eld, 0, 1).toFixed(2)})`;
    p.beginPath();
    p.moveTo(cx - 0.09 * R, cy + 1.5 * R);
    p.lineTo(cx, cy + 1.12 * R);
    p.lineTo(cx + 0.09 * R, cy + 1.5 * R);
    p.closePath();
    p.fill();
  }
  // höljet: hela formen först, så att inget lyser igenom mellan våderna, och sedan våd för våd
  p.fillStyle = skugga(farger[0], 0.8);
  p.beginPath();
  upp(1);
  ner(-1);
  p.closePath();
  p.fill();
  for (let i = 0; i < 7; i += 1) {
    // mörkast i väster, ljusast strax öster om mitten
    p.fillStyle = skugga(farger[i % 2], 0.72 + 0.07 * Math.min(i, 5));
    p.beginPath();
    upp(VADER[i + 1]);
    ner(VADER[i]);
    p.closePath();
    p.fill();
  }
  // bandet runt mitten, och kjolen i mynningen
  if (R >= 5) {
    p.save();
    p.beginPath();
    upp(1);
    ner(-1);
    p.closePath();
    p.clip();
    p.fillStyle = farger[2];
    p.globalAlpha *= 0.92;
    p.fillRect(cx - R, cy + 0.12 * R, 2 * R, 0.17 * R);
    p.restore();
  }
  p.fillStyle = skugga(farger[2], 0.8);
  p.beginPath();
  p.moveTo(cx - 0.2 * R, cy + 1.2 * R);
  p.lineTo(cx + 0.2 * R, cy + 1.2 * R);
  p.lineTo(cx + 0.15 * R, cy + 1.3 * R);
  p.lineTo(cx - 0.15 * R, cy + 1.3 * R);
  p.closePath();
  p.fill();
  // en tunn kant, så att ballongen syns mot ljusa tak
  p.strokeStyle = 'rgba(20,26,36,0.55)';
  p.lineWidth = Math.max(0.6, R * 0.035);
  p.beginPath();
  upp(1);
  ner(-1);
  p.closePath();
  p.stroke();
}

/**
 * En ballong som bild. Bilden är skuren efter ballongens kontur: höljet är så brett som bilden och
 * börjar i dess överkant, mynningen ligger vid fyra femtedelar av höjden och korgen längst ner.
 */
function ritaBallongbild(p: Penna, f: Figur, cx: number, cy: number, R: number, eld: number, gung: number, klocka: number, tathet: number) {
  const b = 2 * R;
  const h = (b * f.h) / f.b;
  p.save();
  p.translate(cx, cy);
  p.rotate(gung);
  // lågan står mellan korgen och mynningen, bakom höljet, och fladdrar
  if (eld > 0 && R >= 2.6) {
    const fladder = 0.85 + 0.15 * Math.sin(klocka * 31);
    const fot = -R + 0.87 * h;
    const topp = fot - 0.12 * h * fladder;
    p.fillStyle = `rgba(255,150,40,${mellan(eld, 0, 1).toFixed(2)})`;
    p.beginPath();
    p.moveTo(-0.07 * R, fot);
    p.quadraticCurveTo(-0.1 * R, (fot + topp) / 2, 0, topp);
    p.quadraticCurveTo(0.1 * R, (fot + topp) / 2, 0.07 * R, fot);
    p.closePath();
    p.fill();
    p.fillStyle = `rgba(255,226,130,${mellan(eld, 0, 1).toFixed(2)})`;
    p.beginPath();
    p.moveTo(-0.035 * R, fot);
    p.lineTo(0, fot - 0.07 * h * fladder);
    p.lineTo(0.035 * R, fot);
    p.closePath();
    p.fill();
  }
  ritaFigur(p, f, -R, -R, b, h, tathet);
  p.restore();
}

/* ---------- flygplanet med banderollen ---------- */

const PLAN_MAX_MPP = 3.2;
const PLANFART = 38; // meter per sekund
const PLANHOJD = 240; // meter över marken
const PLANSTORLEK = 2.4; // gånger verklig storlek, så att det syns
// planets mått i meter, före förstoringen
const BANDEROLL_FRAN = 13; // linans längd bakom stjärten
const BANDEROLLHOJD = 5.4;

type Plan = { x: number; y: number; text: string };

/** Planet, på väg rakt västerut: kropp, vinge ovanpå, stjärt och propeller. Mitten och höjden är satta med stallRit(). */
function ritaPlan(p: Penna, k: number, klocka: number) {
  const KROPP = [-4.2, -0.3, -4.2, 0.3, 1.6, 0.62, 3.5, 0.5, 4.1, 0, 3.5, -0.5, 1.6, -0.62];
  prisma(p, KROPP, 0, 1.15, '#f4f2ec', '#fbfaf6', '#cfd3d8');
  // en röd rand längs sidan
  fyrkant(p, -4.0, 0.55, 0.45, 3.4, 0.55, 0.45, 3.4, 0.55, 0.7, -4.0, 0.55, 0.7, '#c8202b');
  // rutorna framför vingen
  lada3(p, 2.0, 2.9, -0.46, 0.46, 1.15, 1.5, '#f4f2ec', '#2c3a4d', '#1b2430');
  // stabilisatorn och fenan
  lada3(p, -4.3, -3.3, -1.9, 1.9, 0.75, 0.87, '#f4f2ec', '#e4e2dc', '#cfd3d8');
  fyrkant(p, -4.3, 0, 0.85, -3.0, 0, 0.85, -3.7, 0, 2.5, -4.4, 0, 2.5, '#c8202b');
  // vingen ligger ovanpå kroppen, med röda spetsar
  lada3(p, 0.7, 2.3, -5.4, 5.4, 1.5, 1.68, '#f4f2ec', '#e4e2dc', '#cfd3d8');
  lada3(p, 0.7, 2.3, 4.4, 5.4, 1.5, 1.69, '#c8202b', '#b01c26', '#8f1820');
  lada3(p, 0.7, 2.3, -5.4, -4.4, 1.5, 1.69, '#c8202b', '#b01c26', '#8f1820');
  // propellern: en skiva som flimrar
  const nx = skX(4.2, 0, 0.6);
  const ny = skY(4.2, 0, 0.6);
  p.fillStyle = `rgba(60,66,76,${(0.22 + 0.1 * Math.sin(klocka * 40)).toFixed(2)})`;
  p.beginPath();
  p.ellipse(nx, ny, Math.max(0.6, 0.25 * k), Math.max(1.2, 1.0 * k), 0, 0, Math.PI * 2);
  p.fill();
}

/* ---------- regalskeppet Vasa ---------- */

// Där hon gick och där hon sjönk, utanför Beckholmen. Sträckan är slutet av hennes 1 300 meter.
const VASA = { stad: 'stockholm', fran: { lat: 59.3206, lng: 18.091 }, till: { lat: 59.32, lng: 18.0958 } };
const VASA_MAX_MPP = 2.6;
const VASAFART = 5.5; // meter per sekund
const VASASTORLEK = 1.25;
const VASA_BESKED = 'Regalskeppet Vasa, 10 augusti 1628. Hon kom 1 300 meter.';
const EK = '#6b4426';
const EK_MORK = '#4f3019';
const ROTT = '#9a3324';
const ROTT_MORKT = '#74261b';
const DACK = '#b08a5a';
const SEGEL = '#f3ead2';
const SEGEL_SKUGGA = '#d8cdaf';
const SKROV = [-24, -4.4, -24, 4.4, -14, 5.6, 8, 5.8, 18, 4.2, 25, 0, 18, -4.2, 8, -5.8, -14, -5.6];
// Skeppet som bild: från akterspegeln till bogsprötets spets, i samma mått som det ritade, med
// fören åt höger. Bildens underkant är vattenlinjen på den sida som vetter mot kameran.
const SKEPP_FRAN = -24;
const SKEPP_TILL = 34;
const SKEPP_VATTENLINJE = 2.6; // så långt nedanför skeppets mitt på skärmen, i skeppets mått

/** Skeppet: skrov, relingar, för- och akterkastell, tre master med segel och flaggan i stortoppen. */
function ritaVasa(p: Penna, k: number) {
  prisma(p, SKROV, 0, 4.4, DACK, EK, EK_MORK);
  prisma(p, SKROV, 4.4, 6.0, DACK, ROTT, ROTT_MORKT);
  const akter = () => {
    lada3(p, -24, -11, -4.6, 4.6, 6.0, 10.4, DACK, ROTT, ROTT_MORKT);
    langband(p, -24, -11, 4.6, 9.5, 10.1, '#d9a93a');
    kortband(p, -24, false, -4.2, 4.2, 6.6, 9.8, '#c9982f');
    lada3(p, -24, -17.5, -4.0, 4.0, 10.4, 13.2, DACK, ROTT, ROTT_MORKT);
    langband(p, -24, -17.5, 4.0, 12.4, 12.9, '#d9a93a');
  };
  const forut = () => {
    lada3(p, 10, 18, -4.4, 4.4, 6.0, 7.6, DACK, ROTT, ROTT_MORKT);
    streck(p, 22, 0, 6, 34, 0, 11.5, EK_MORK, Math.max(0.8, 0.5 * k));
  };
  // seglen står brassade, snett mot skeppets riktning, så att de syns från sidan
  const sinA = Math.sin(0.72);
  const cosA = Math.cos(0.72);
  const mast = (f: number, fot: number, topp: number) => streck(p, f, 0, fot, f, 0, topp, EK_MORK, Math.max(0.8, 0.55 * k));
  const segel = (f: number, bredd: number, u0: number, u1: number) => {
    const b = bredd / 2;
    fyrkant(p, f - sinA * b, -cosA * b, u0, f + sinA * b, cosA * b, u0, f + sinA * b * 0.86, cosA * b * 0.86, u1, f - sinA * b * 0.86, -cosA * b * 0.86, u1, SEGEL);
    // en skugga längs seglets nedre kant, och rån det hänger i
    fyrkant(p, f - sinA * b, -cosA * b, u0, f + sinA * b, cosA * b, u0, f + sinA * b * 0.98, cosA * b * 0.98, u0 + (u1 - u0) * 0.16, f - sinA * b * 0.98, -cosA * b * 0.98, u0 + (u1 - u0) * 0.16, SEGEL_SKUGGA);
    streck(p, f - sinA * b * 0.9, -cosA * b * 0.9, u1, f + sinA * b * 0.9, cosA * b * 0.9, u1, EK_MORK, Math.max(0.6, 0.3 * k));
  };
  const mesan = () => {
    mast(-16, 10.4, 30);
    trekant(p, -16, 0, 13, -16, 0, 27, -23.5, 1.6, 13.5, SEGEL);
  };
  const stor = () => {
    mast(-1, 6, 45);
    segel(-1, 22, 9, 21);
    segel(-1, 17, 24, 35);
    // flaggan i stortoppen: blå med gult kors
    fyrkant(p, -1, 0, 41.5, -6.4, 0, 41.5, -6.4, 0, 45, -1, 0, 45, '#1f5fa8');
    fyrkant(p, -1, 0, 42.9, -6.4, 0, 42.9, -6.4, 0, 43.6, -1, 0, 43.6, '#f2c230');
    fyrkant(p, -2.6, 0, 41.5, -3.4, 0, 41.5, -3.4, 0, 45, -2.6, 0, 45, '#f2c230');
  };
  const fock = () => {
    mast(13, 7.6, 37);
    segel(13, 19, 10, 20);
    segel(13, 14, 22, 31);
  };
  akter();
  forut();
  mesan();
  stor();
  fock();
}

/* ---------- delen ---------- */

export function luftdel(v: Verktyg): Del {
  let ballonger: Ballong[] = [];
  let senasteVy: Vy | null = null;
  let vind = { x: 0, y: 0 }; // bildpunkter per sekund
  let plan: Plan | null = null;
  let planvila = 20;
  let pass = 0;
  // Vasa: var hon är på sin sträcka, och hur långt hon har kommit i att sjunka
  const vasa = { finns: false, x0: 0, y0: 0, x1: 0, y1: 0, meter: 0, strackan: 0, dr: 1, df: 0, tid: -1, sett: 0, gjort: false, sagt: false };
  // adresserna till stadens figurer hos bildtjänsten, när den har några
  let ballongbilder: string[] = [];
  let skeppsbild: string | null = null;
  const typsnitt = (getComputedStyle(document.documentElement).getPropertyValue('--font-sans') || '').trim() || 'system-ui, sans-serif';

  /** Banderollens texter, en per överflygning. */
  const texter = (): string[] => [`Hej ${v.stad()?.namn ?? 'Sverige'}!`, 'techembassy.se', 'Öppen källkod', 'Lägg till ditt bolag'];

  function ballongplats(b: Ballong, vy: Vy): { cx: number; cy: number; R: number; gx: number; gy: number; hojd: number } {
    const k = vy.skala / v.mpb;
    const hojd = b.hojd + b.extra + 9 * Math.sin(v.klocka() * 0.21 + b.fas);
    const gx = vy.ox + b.x * vy.skala;
    const gy = vy.oy + b.y * vy.skala;
    return { cx: gx, cy: gy - (hojd * k) / ROT2, R: Math.max(1.8, BALLONGRADIE * k), gx, gy, hojd };
  }

  function nyttPlan(vy: Vy): Plan {
    const k = vy.skala / v.mpb;
    const lyft = (PLANHOJD * k) / ROT2;
    const r = v.ruta();
    // det korsar rutan i dess övre halva, och börjar strax utanför den högra kanten
    const skarmY = r.hojd * (0.18 + 0.4 * Math.random());
    const lista = texter();
    const text = lista[pass % lista.length];
    pass += 1;
    return { x: vy.x1 + (60 * PLANSTORLEK) / v.mpb, y: (skarmY + lyft - vy.oy) / vy.skala, text };
  }

  /** Hur långt Vasa har lutat (0 till 1) och sjunkit (meter) vid en viss tid efter att hon började kränga. */
  const krangning = (tid: number): number => mellan(tid / 7, 0, 1) ** 1.6;
  const sjunkit = (tid: number): number => mellan((tid - 5) / 11, 0, 1) ** 1.3 * 52;

  return {
    oppna(stad) {
      // Så många ballonger som stadens yta bär, utspridda över hela kartbilden.
      const kvkm = (stad.bredd * v.mpb * stad.hojd * v.mpb * ROT2) / 1e6;
      const antal = Math.round(mellan(kvkm / KVADRATKILOMETER_PER_BALLONG, 3, 400));
      ballonger = [];
      for (let i = 0; i < antal; i += 1) {
        ballonger.push({ x: Math.random() * stad.bredd, y: Math.random() * stad.hojd, hojd: 110 + 170 * Math.random(), fas: Math.random() * 6.28, farger: Math.floor(Math.random() * BALLONGFARGER.length), eld: 0, extra: 0 });
      }
      // vinden är densamma för alla, och svag: 2 till 3,5 meter i sekunden
      const vinkel = Math.random() * Math.PI * 2;
      const fart = 2 + 1.5 * Math.random();
      vind = { x: (Math.cos(vinkel) * fart) / v.mpb, y: (-Math.sin(vinkel) * fart) / (ROT2 * v.mpb) };
      plan = null;
      planvila = 12 + 20 * Math.random();
      ballongbilder = (stad.filer.figures?.balloons ?? []).map((fil) => v.adress(fil));
      for (const adress of ballongbilder) figur(adress);
      skeppsbild = stad.filer.figures?.ship ? v.adress(stad.filer.figures.ship) : null;
      vasa.finns = stad.id === VASA.stad;
      vasa.tid = -1;
      vasa.meter = 0;
      vasa.sett = 0;
      vasa.gjort = false;
      vasa.sagt = false;
      if (vasa.finns) {
        const a = stad.tillBild(VASA.fran.lat, VASA.fran.lng);
        const b = stad.tillBild(VASA.till.lat, VASA.till.lng);
        const ost = (b.x - a.x) * v.mpb;
        const nord = -(b.y - a.y) * v.mpb * ROT2;
        vasa.x0 = a.x;
        vasa.y0 = a.y;
        vasa.x1 = b.x;
        vasa.y1 = b.y;
        vasa.strackan = Math.hypot(ost, nord);
        vasa.dr = ost / vasa.strackan;
        vasa.df = nord / vasa.strackan;
      }
    },
    rensa() {
      plan = null;
    },
    steg(dt, vy) {
      senasteVy = vy;
      const stad = v.stad();
      if (!stad) return;
      // Ballongerna driver hela tiden, också de som ingen ser, och kommer in igen på andra sidan kartbilden.
      const marginal = 400;
      for (const b of ballonger) {
        b.x += vind.x * dt;
        b.y += vind.y * dt;
        if (b.x < -marginal) b.x += stad.bredd + 2 * marginal;
        else if (b.x > stad.bredd + marginal) b.x -= stad.bredd + 2 * marginal;
        if (b.y < -marginal) b.y += stad.hojd + 2 * marginal;
        else if (b.y > stad.hojd + marginal) b.y -= stad.hojd + 2 * marginal;
        if (b.eld > 0) {
          b.eld -= dt;
          b.extra += 14 * dt; // brännaren går: den stiger
        } else if (b.extra > 0) {
          b.extra = Math.max(0, b.extra - 2.5 * dt); // och sjunker sakta tillbaka
        }
      }
      // Flygplanet: ett i taget, med en paus emellan. På en svag dator flyger inget.
      if (plan) {
        plan.x -= (PLANFART / v.mpb) * dt;
        const langd = ((BANDEROLL_FRAN + 80) * PLANSTORLEK) / v.mpb;
        if (plan.x < vy.x0 - langd - (vy.x1 - vy.x0) * 0.3) {
          plan = null;
          planvila = 55 + 60 * Math.random();
        }
      } else if (v.niva() >= 2 && vy.mpp <= PLAN_MAX_MPP - 0.4) {
        planvila -= dt;
        if (planvila <= 0) plan = nyttPlan(vy);
      }
      // Vasa: hon ger sig av när någon har sett på vattnet där en stund, en gång per besök.
      if (vasa.finns && !vasa.gjort) {
        if (vasa.tid < 0 && vasa.meter === 0) {
          const nara = vy.mpp <= VASA_MAX_MPP && vasa.x1 > vy.x0 && vasa.x1 < vy.x1 && vasa.y1 > vy.y0 && vasa.y1 < vy.y1;
          vasa.sett = nara ? vasa.sett + dt : 0;
          // hennes bild hämtas först när någon ser på vattnet, och hon väntar på den
          const hamtas = nara && !!skeppsbild && figur(skeppsbild) === undefined;
          if (vasa.sett > 4 && !hamtas) vasa.meter = 0.01;
        } else if (vasa.tid < 0) {
          vasa.meter += VASAFART * dt;
          if (vasa.meter >= vasa.strackan) vasa.tid = 0;
        } else {
          vasa.tid += dt;
          // hon driver vidare en bit medan hon kränger
          vasa.meter += VASAFART * Math.max(0, 1 - vasa.tid / 6) * dt;
          const iBild = vasa.x1 > vy.x0 && vasa.x1 < vy.x1 && vasa.y1 > vy.y0 && vasa.y1 < vy.y1 && vy.mpp <= VASA_MAX_MPP + 1;
          if (vasa.tid > 15 && !vasa.sagt) {
            vasa.sagt = true;
            if (iBild) v.sag(VASA_BESKED, 7000);
          }
          if (vasa.tid > 19) vasa.gjort = true;
        }
      }
    },
    rita() {
      /* allt här ligger över bilar och fåglar: se ritaOver */
    },
    ritaOver(vy) {
      const p = v.penna;
      const r = v.ruta();
      const k = vy.skala / v.mpb;

      // Vasa ligger på vattnet, under det som flyger.
      if (vasa.finns && !vasa.gjort && vasa.meter > 0 && vy.mpp <= VASA_MAX_MPP + 1) {
        const andel = vasa.meter / vasa.strackan;
        const x = vy.ox + (vasa.x0 + (vasa.x1 - vasa.x0) * andel) * vy.skala;
        const y = vy.oy + (vasa.y0 + (vasa.y1 - vasa.y0) * andel) * vy.skala;
        if (x > -400 && x < r.bredd + 400 && y > -400 && y < r.hojd + 400) {
          const K = k * VASASTORLEK;
          const tid = Math.max(0, vasa.tid);
          const djup = sjunkit(tid);
          const toning = mellan((VASA_MAX_MPP + 1 - vy.mpp) / 0.8, 0, 1) * mellan((19 - tid) / 3, 0, 1);
          p.globalAlpha = toning;
          const bild = skeppsbild ? figur(skeppsbild) : null;
          // bilden visar skeppet från sidan: dess vatten ligger vid skrovets underkant, inte vid skeppets mitt
          const vatten = y + (bild ? SKEPP_VATTENLINJE * K : 0);
          // kölvattnet medan hon seglar, och ringarna på vattnet när hon går under
          if (vasa.tid < 0) {
            p.strokeStyle = 'rgba(235,246,250,0.4)';
            p.lineWidth = Math.max(1, 2.2 * K);
            p.lineCap = 'round';
            p.beginPath();
            // bilden ligger vågrätt också när sträckan lutar: kölvattnet börjar då vid aktern i vattenlinjen
            const akterY = vatten + (bild ? 0 : (vasa.df / ROT2) * 24 * K);
            p.moveTo(x - vasa.dr * 24 * K, akterY);
            p.lineTo(x - vasa.dr * 52 * K, akterY + (vasa.df / ROT2) * 28 * K);
            p.stroke();
          } else {
            for (let ring = 0; ring < 3; ring += 1) {
              const vidd = ((tid * 3.2 + ring * 9) % 34) + 6;
              p.strokeStyle = `rgba(235,246,250,${(0.5 * (1 - vidd / 40)).toFixed(2)})`;
              p.lineWidth = Math.max(1, 0.9 * K);
              p.beginPath();
              p.ellipse(x, vatten, vidd * K, (vidd * K) / ROT2, 0, 0, Math.PI * 2);
              p.stroke();
            }
          }
          p.save();
          if (bild) {
            // Bilden står stilla; rörelsen läggs på här. Hon gungar medan hon seglar. Sedan lägger
            // hon sig över och sjunker, och det som är under vattenlinjen ritas inte.
            const bredd = (SKEPP_TILL - SKEPP_FRAN) * K;
            const hojd = (bredd * bild.h) / bild.b;
            const vattenlinje = vatten;
            const kr = krangning(tid);
            const gung = vasa.tid < 0 ? Math.sin(v.klocka() * 1.1) : 0;
            // skuggan på vattnet, åt väster, och skummet längs skrovet
            if (djup < 6) {
              p.fillStyle = 'rgba(8,12,20,0.13)';
              p.beginPath();
              p.ellipse(x - 5 * K, vattenlinje + 0.4 * K, 27 * K, 3 * K, 0, 0, Math.PI * 2);
              p.fill();
              p.fillStyle = 'rgba(235,246,250,0.34)';
              p.beginPath();
              p.ellipse(x + 0.5 * K, vattenlinje, 26 * K, 1.1 * K, 0, 0, Math.PI * 2);
              p.fill();
            }
            p.beginPath();
            p.rect(0, 0, r.bredd, vattenlinje + 0.6 * K);
            p.clip();
            p.translate(x, vattenlinje + (djup * K) / ROT2 + 0.25 * K * gung);
            p.rotate(0.012 * gung - 0.1 * kr);
            // masterna lutar akteröver och blir kortare, som när hon lägger sig på sidan
            p.transform(1, 0, 0.4 * kr, 1 - 0.22 * kr, 0, 0);
            ritaFigur(p, bild, (SKEPP_FRAN / (SKEPP_TILL - SKEPP_FRAN)) * bredd, -hojd, bredd, hojd, r.tathet);
          } else {
            // Ritad i kod: hon kränger åt babord, bort från kameran, och sjunker.
            if (djup > 0) {
              stallRit(x, y, vasa.dr, vasa.df, K);
              let vattenlinje = -Infinity;
              for (let i = 0; i < SKROV.length; i += 2) vattenlinje = Math.max(vattenlinje, skY(SKROV[i], SKROV[i + 1], 0));
              p.beginPath();
              p.rect(0, 0, r.bredd, vattenlinje + 0.5);
              p.clip();
            }
            stallRit(x, y, vasa.dr, vasa.df, K, -djup, -0.9 * krangning(tid));
            ritaVasa(p, K);
          }
          p.restore();
          // skummet där vattnet sluter sig om henne, så att hon inte är avskuren med ett rakt snitt
          if (bild && djup > 0 && djup < 50) {
            const kvar = 1 - djup / 52;
            p.fillStyle = `rgba(235,246,250,${(0.5 * Math.min(1, djup / 4)).toFixed(2)})`;
            p.beginPath();
            p.ellipse(x + 2 * K, vatten + 0.5 * K, (8 + 20 * kvar) * K, (0.8 + 0.9 * kvar) * K, 0, 0, Math.PI * 2);
            p.fill();
          }
          p.globalAlpha = 1;
        }
      }

      // Ballongerna: först alla skuggor på marken, sedan ballongerna själva.
      const toning = mellan((BALLONG_MAX_MPP - vy.mpp) / 1.5, 0, 1);
      // Har bildtjänsten ballonger som bilder ritas de, när alla har kommit. Går någon inte att hämta ritas ballongerna i kod.
      const hamtade = ballongbilder.map(figur);
      const bilder = hamtade.every((f) => !!f) ? (hamtade as Figur[]) : [];
      const vantar = hamtade.some((f) => f === undefined) && !hamtade.includes(null);
      if (toning > 0 && ballonger.length && !vantar) {
        const R0 = Math.max(1.8, BALLONGRADIE * k);
        for (let varv = 0; varv < 2; varv += 1) {
          for (const b of ballonger) {
            const gx = vy.ox + b.x * vy.skala;
            if (gx < -R0 * 3 - 400 * k || gx > r.bredd + R0 * 3 + 400 * k) continue;
            const s = ballongplats(b, vy);
            if (varv === 0) {
              const sx = s.gx - SKUGGA_VAST * s.hojd * k;
              const sy = s.gy + SKUGGA_SYD * s.hojd * k;
              if (sx < -s.R || sx > r.bredd + s.R || sy < -s.R || sy > r.hojd + s.R || s.R < 2.6) continue;
              p.globalAlpha = toning;
              p.fillStyle = 'rgba(8,12,20,0.16)';
              p.beginPath();
              p.ellipse(sx, sy, s.R, s.R / ROT2, 0, 0, Math.PI * 2);
              p.fill();
            } else {
              if (s.cy < -s.R * 2.2 || s.cy > r.hojd + s.R * 1.4 || s.cx < -s.R * 1.4 || s.cx > r.bredd + s.R * 1.4) continue;
              p.globalAlpha = toning;
              if (bilder.length) ritaBallongbild(p, bilder[b.farger % bilder.length], s.cx, s.cy, s.R, b.eld, 0.03 * Math.sin(v.klocka() * 0.6 + b.fas * 3), v.klocka(), r.tathet);
              else ritaBallong(p, s.cx, s.cy, s.R, BALLONGFARGER[b.farger], b.eld, v.skugga);
            }
          }
        }
        p.globalAlpha = 1;
      }

      // Flygplanet och banderollen.
      if (plan) {
        const ptoning = mellan((PLAN_MAX_MPP - vy.mpp) / 0.6, 0, 1);
        const gx = vy.ox + plan.x * vy.skala;
        const gy = vy.oy + plan.y * vy.skala;
        const K = k * PLANSTORLEK;
        if (ptoning > 0 && gx > -200 * K && gx < r.bredd + 30 * K) {
          p.globalAlpha = ptoning;
          // skuggan på marken: kroppen och vingen
          stallRit(gx - SKUGGA_VAST * PLANHOJD * k, gy + SKUGGA_SYD * PLANHOJD * k, -1, 0, K);
          fyrkant(p, -4.2, -0.5, 0, 4.1, -0.5, 0, 4.1, 0.5, 0, -4.2, 0.5, 0, 'rgba(8,12,20,0.16)');
          fyrkant(p, 0.7, -5.4, 0, 2.3, -5.4, 0, 2.3, 5.4, 0, 0.7, 5.4, 0, 'rgba(8,12,20,0.16)');
          stallRit(gx, gy, -1, 0, K, PLANHOJD / PLANSTORLEK);
          // Banderollen hänger i en lina bakom planet. Den står på högkant längs flykten, med
          // sidan mot kameran, och texten börjar närmast planet.
          const hojd = (BANDEROLLHOJD * K) / ROT2;
          const stil = `700 ${Math.max(4, hojd * 0.62).toFixed(1)}px ${typsnitt}`;
          p.font = stil;
          const textbredd = hojd >= 7 ? p.measureText(plan.text).width : plan.text.length * hojd * 0.36;
          const vanster = skX(-4.2 - BANDEROLL_FRAN, 0, 0.6);
          const topp = skY(0, 0, 0.6 + BANDEROLLHOJD / 2);
          const bredd = textbredd + hojd * 1.1;
          streck(p, -4.3, 0, 0.6, -4.2 - BANDEROLL_FRAN, 0, 0.6 + BANDEROLLHOJD / 2, 'rgba(40,34,26,0.75)', Math.max(0.5, 0.06 * K));
          streck(p, -4.3, 0, 0.6, -4.2 - BANDEROLL_FRAN, 0, 0.6 - BANDEROLLHOJD / 2, 'rgba(40,34,26,0.75)', Math.max(0.5, 0.06 * K));
          p.fillStyle = '#fdfbf7';
          p.fillRect(vanster, topp, bredd, hojd);
          p.fillStyle = '#c8202b';
          p.fillRect(vanster, topp, Math.max(1, hojd * 0.16), hojd);
          p.strokeStyle = 'rgba(28,26,23,0.7)';
          p.lineWidth = Math.max(0.5, hojd * 0.05);
          p.strokeRect(vanster, topp, bredd, hojd);
          p.fillStyle = '#1c1a17';
          if (hojd >= 7) {
            p.textBaseline = 'middle';
            p.textAlign = 'left';
            p.fillText(plan.text, vanster + hojd * 0.6, topp + hojd * 0.54);
          } else {
            // för liten för att läsa: ett streck där texten står
            p.fillRect(vanster + hojd * 0.6, topp + hojd * 0.4, textbredd, Math.max(1, hojd * 0.2));
          }
          ritaPlan(p, K, v.klocka());
          p.globalAlpha = 1;
        }
      }
    },
    tryck(x, y, vy) {
      if (vy.mpp > BALLONG_MAX_MPP) return null;
      for (const b of ballonger) {
        const s = ballongplats(b, vy);
        // hela ballongen med korgen, och lite till för ett finger
        if (Math.hypot(x - s.cx, y - (s.cy + 0.3 * s.R)) > s.R * 1.35 + 8) continue;
        b.eld = 3;
        return 'Du hittade en ballong. Den eldar på och stiger.';
      }
      return null;
    },
    pask() {
      if (!vasa.finns) return false;
      vasa.gjort = false;
      vasa.sagt = false;
      vasa.tid = -1;
      vasa.meter = 0.01;
      return true;
    },
    tillstand: () => {
      // för prov: var på skärmen den första ballongen i rutan står
      const vy = senasteVy;
      const r = v.ruta();
      let synlig: { x: number; y: number } | null = null;
      if (vy && vy.mpp <= BALLONG_MAX_MPP) {
        for (const b of ballonger) {
          const s = ballongplats(b, vy);
          if (s.cx < 20 || s.cx > r.bredd - 20 || s.cy < 20 || s.cy > r.hojd - 20) continue;
          synlig = { x: Math.round(s.cx), y: Math.round(s.cy) };
          break;
        }
      }
      return {
        ballonger: ballonger.length,
        ballongIRutan: synlig,
        eldar: ballonger.filter((b) => b.eld > 0).length,
        flygplan: plan ? plan.text : null,
        ballongbilder: ballongbilder.filter((adress) => !!figur(adress)).length,
        skeppsbild: !!skeppsbild && !!figur(skeppsbild),
        vasa: !vasa.finns ? null : vasa.gjort ? 'borta' : vasa.tid >= 0 ? 'sjunker' : vasa.meter > 0 ? 'seglar' : 'väntar',
      };
    },
  };
}
