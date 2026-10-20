// Frågestatistiken: Fråga kartans loggrader räknade till antal per dag, för öppen publicering.
// Loggraden bär bara svarets sort, om modellen svarade, modellens fel och frågans ämne i kartans
// egna ord (src/lib/fraga/handler.ts). Här räknas varje dimension för sig. Inga klockslag, inga
// id:n och inga kombinationer sparas, och ingen rad ur loggen skrivs ut, inte ens vid fel.
//
// Dagen räknas i ett tillstånd som inte publiceras. Först när dagen är slut publiceras den, och
// då räknas ämnen som förekom färre än TROSKEL gånger som övrigt. Annars skulle en ensam fråga
// synas med sin tid och sin kombination av område och län när få frågar.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/** Vercels gratisplan sparar loggen i en timme. Marginalen tar höjd för att körningen startar sent. */
export const LAGRING_MS = 55 * 60 * 1000;
/** Loggen når Vercel med viss fördröjning. Det senaste fönstret väntar därför till nästa körning. */
export const FORDROJNING_MS = 5 * 60 * 1000;
/**
 * Högst så många funktionsrader hämtas per körning. Fylls gränsen kan rader saknas, och det sägs
 * som en lucka. Skulle Vercels CLI tyst ge färre rader än begärt syns det inte här.
 */
export const MAX_RADER = 1000;

const SORTER = new Set(['traffar', 'bred', 'tomt', 'manniska', 'ranking', 'kontakt', 'opensverige', 'utanfor', 'data-saknas', 'motorfel']);
const MODELLFEL = new Set(['saknas', 'slut', 'nyckel', 'modell', 'tak', 'begransad', 'nere', 'tidsgrans', 'ogiltig']);
/** Fel som pausar AI-tolkningen eller betyder att leverantören är nere. Ett larm per fel och dag. */
export const LARMFEL = new Set(['saknas', 'slut', 'nyckel', 'modell', 'tak', 'nere']);
const NYCKEL = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const LAN = /^\d{2}$/;
/** Ett ämne som förekom färre gånger än så under en dag publiceras som övrigt. */
export const TROSKEL = 3;
/** Dimensionerna som säger vad frågan handlade om. Svarets sort och modellens fel publiceras exakt. */
const AMNEN = ['omrade', 'typ', 'erbjuder', 'lan'];

/** Det som bärs mellan körningarna och aldrig publiceras: markören och dagar som inte är slut. */
export function tomtTillstand() {
  return { start: null, markor: null, dagar: {}, luckor: [], larmat: {} };
}

export function tomPublicering() {
  return {
    beskrivning:
      'Fråga kartan på karta.opensverige.se, räknat per dag i svensk tid och publicerat när dagen är slut. Varje dimension räknas för sig, utan klockslag och utan kombinationer. Ett område, en typ, ett erbjudande eller ett län som förekom färre än tröskeln under dagen räknas som ovrigt. Frågornas text sparas aldrig.',
    metod: 'https://karta.opensverige.se/integritet#fraga',
    troskel: TROSKEL,
    /** Från när siffrorna gäller. Frågor före den första körningen är inte räknade. */
    start: null,
    dagar: {},
    /** Tider då frågor kan ha gått förlorade, så att ingen siffra ser hel ut när den inte är det. */
    luckor: [],
  };
}

/** Dagen i svensk tid, till exempel "2026-10-20". */
export function svenskDag(ms) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
}

/**
 * Fönstret som ska hämtas: från markören till strax före nu. Ligger markören längre bak än
 * loggen sparas börjar fönstret där loggen börjar, och tiden däremellan blir en lucka.
 */
export function fonster(markor, nu) {
  const till = nu - FORDROJNING_MS;
  const tidigast = nu - LAGRING_MS;
  if (markor === null) return { fran: tidigast, till, lucka: null };
  const fran = Date.parse(markor);
  if (fran >= tidigast) return { fran, till, lucka: null };
  return { fran: tidigast, till, lucka: { fran: markor, till: new Date(tidigast).toISOString(), orsak: 'lagring' } };
}

const arStrangar = (v) => Array.isArray(v) && v.every((x) => typeof x === 'string' && NYCKEL.test(x));

/** En loggrad som den ser ut, eller null. Allt som inte passar formen kastas utan att läsas vidare. */
export function lasLoggrad(v) {
  if (typeof v !== 'object' || v === null || v.requestPath !== '/api/fraga' || typeof v.message !== 'string') return null;
  if (typeof v.timestamp !== 'number' || !Number.isFinite(v.timestamp)) return null;
  let rad;
  try {
    rad = JSON.parse(v.message);
  } catch {
    return null;
  }
  if (typeof rad !== 'object' || rad === null || !SORTER.has(rad.sort) || typeof rad.utanModell !== 'boolean') return null;
  if (rad.modellfel !== null && !MODELLFEL.has(rad.modellfel)) return null;
  let amne = null;
  if (rad.amne !== null && rad.amne !== undefined) {
    const a = rad.amne;
    if (typeof a !== 'object' || !arStrangar(a.omrade) || !arStrangar(a.typ) || !arStrangar(a.erbjuder)) return null;
    if (a.lan !== null && !(typeof a.lan === 'string' && LAN.test(a.lan))) return null;
    amne = { omrade: a.omrade, typ: a.typ, erbjuder: a.erbjuder, lan: a.lan };
  }
  return { tid: v.timestamp, sort: rad.sort, utanModell: rad.utanModell, modellfel: rad.modellfel, amne };
}

/** Raderna ur `vercel logs --json`, en JSON per rad. Annat på raden räknas bara som kastat. */
export function lasLoggar(text) {
  const rader = [];
  let kastade = 0;
  let totalt = 0;
  for (const linje of text.split('\n')) {
    if (!linje.trim()) continue;
    totalt += 1;
    let v;
    try {
      v = JSON.parse(linje);
    } catch {
      kastade += 1;
      continue;
    }
    const rad = lasLoggrad(v);
    if (rad) rader.push(rad);
    else if (v?.requestPath === '/api/fraga') kastade += 1;
  }
  return { rader, kastade, totalt };
}

function tomDag() {
  return { fragor: 0, modellen_svarade: 0, svar: {}, modellfel: {}, omrade: {}, typ: {}, erbjuder: {}, lan: {} };
}

const oka = (tabell, nyckel) => {
  tabell[nyckel] = (tabell[nyckel] ?? 0) + 1;
};

/**
 * Lägger fönstrets rader i statistiken och flyttar markören. Rader utanför fönstret räknas inte,
 * så att två körningar aldrig räknar samma rad. Returnerar de larm som är nya för dagen.
 */
export function laggTill(tillstand, rader, { fran, till, lucka }, antalHamtade) {
  const s = structuredClone(tillstand);
  s.start ??= new Date(fran).toISOString();
  if (lucka) s.luckor.push(lucka);
  if (antalHamtade >= MAX_RADER) {
    s.luckor.push({ fran: new Date(fran).toISOString(), till: new Date(till).toISOString(), orsak: 'for-manga-rader' });
  }
  const nyaLarm = [];
  for (const r of rader) {
    if (r.tid < fran || r.tid >= till) continue;
    const dagnamn = svenskDag(r.tid);
    const dag = (s.dagar[dagnamn] ??= tomDag());
    dag.fragor += 1;
    if (!r.utanModell) dag.modellen_svarade += 1;
    oka(dag.svar, r.sort);
    if (r.modellfel) {
      oka(dag.modellfel, r.modellfel);
      const larmat = (s.larmat[dagnamn] ??= []);
      if (LARMFEL.has(r.modellfel) && !larmat.includes(r.modellfel)) {
        larmat.push(r.modellfel);
        nyaLarm.push({ dag: dagnamn, modellfel: r.modellfel });
      }
    }
    if (r.amne) {
      for (const x of r.amne.omrade) oka(dag.omrade, x);
      for (const x of r.amne.typ) oka(dag.typ, x);
      for (const x of r.amne.erbjuder) oka(dag.erbjuder, x);
      if (r.amne.lan) oka(dag.lan, r.amne.lan);
    }
  }
  s.markor = new Date(till).toISOString();
  const nyaLuckor = s.luckor.slice(tillstand.luckor.length);
  // Schemat i GitHub är ofta försenat. Varje lucka sparas, men larmet kommer en gång per dag.
  if (nyaLuckor.length > 0) {
    const dagnamn = svenskDag(till);
    const larmat = (s.larmat[dagnamn] ??= []);
    if (!larmat.includes('lucka')) {
      larmat.push('lucka');
      nyaLarm.push({ dag: dagnamn, modellfel: null });
    }
  }
  return { tillstand: s, nyaLarm, nyaLuckor };
}

/**
 * Rapporten i Actions-loggen och i larmärendet, som båda är öppna. Den säger inte hur många som
 * frågade i fönstret, eftersom det skulle visa när en enskild fråga kom. Bara fel och luckor.
 */
export function rapport({ fran, till }, kastade, nyaLarm, nyaLuckor) {
  const delar = [`Fönster: ${new Date(fran).toISOString()} till ${new Date(till).toISOString()}`, `Kastade rader: ${kastade}`];
  for (const l of nyaLarm) delar.push(l.modellfel ? `Modellfel ${l.modellfel} för första gången ${l.dag}` : `Lucka för första gången ${l.dag}`);
  for (const l of nyaLuckor) delar.push(`Lucka (${l.orsak}): ${l.fran} till ${l.till}`);
  return delar.join('\n');
}

/** Ämnen under tröskeln slås ihop till ovrigt. Totalen, svaren och modellens fel står kvar exakt. */
export function avrunda(dag, troskel = TROSKEL) {
  const ut = structuredClone(dag);
  for (const namn of AMNEN) {
    const tabell = {};
    let ovrigt = 0;
    for (const [nyckel, antal] of Object.entries(dag[namn])) {
      if (antal >= troskel) tabell[nyckel] = antal;
      else ovrigt += antal;
    }
    if (ovrigt > 0) tabell.ovrigt = ovrigt;
    ut[namn] = tabell;
  }
  return ut;
}

/**
 * Flyttar dagar som är slut från tillståndet till publiceringen. En dag är slut när markören har
 * passerat midnatt efter den, så att dagens sista minuter också är hämtade.
 */
export function publicera(tillstand, publicering) {
  const t = structuredClone(tillstand);
  const p = structuredClone(publicering);
  if (t.markor === null) return { tillstand: t, publicering: p, andrad: false };
  const idag = svenskDag(Date.parse(t.markor));
  p.start ??= t.start;
  let andrad = false;
  for (const dag of Object.keys(t.dagar).sort()) {
    if (dag >= idag) continue;
    p.dagar[dag] = avrunda(t.dagar[dag]);
    delete t.dagar[dag];
    andrad = true;
  }
  const kvar = [];
  for (const l of t.luckor) {
    if (svenskDag(Date.parse(l.till)) < idag) {
      p.luckor.push(l);
      andrad = true;
    } else kvar.push(l);
  }
  t.luckor = kvar;
  for (const dag of Object.keys(t.larmat)) if (dag < idag) delete t.larmat[dag];
  return { tillstand: t, publicering: p, andrad };
}

/**
 * Tillståndet saknas fast statistiken redan har börjat, till exempel när GitHubs cache har rensats.
 * Frågorna sedan förra körningen är då förlorade. Luckan har ingen känd början och läggs i fönstret,
 * så att den larmar som andra luckor.
 */
export function forloratTillstand(publicering, nu) {
  const tillstand = tomtTillstand();
  if (publicering.start === null) return { tillstand, lucka: null };
  tillstand.start = publicering.start;
  return { tillstand, lucka: { fran: null, till: new Date(nu - LAGRING_MS).toISOString(), orsak: 'tillstand-saknas' } };
}

/**
 * Tillståndet sparas i GitHubs cache mellan körningarna. En pull request från en fork kan läsa
 * cachen, så tillståndet krypteras med en nyckel ur VERCEL_TOKEN, som sådana körningar inte får.
 * Byts token blir det gamla tillståndet oläsligt, och det räknas som förlorat.
 */
const nyckelUr = (token) => createHash('sha256').update(`fragestatistik:${token}`).digest();

export function forsegla(varde, token) {
  const iv = randomBytes(12);
  const chiffer = createCipheriv('aes-256-gcm', nyckelUr(token), iv);
  const data = Buffer.concat([chiffer.update(JSON.stringify(varde), 'utf8'), chiffer.final()]);
  return { v: 1, iv: iv.toString('base64'), tag: chiffer.getAuthTag().toString('base64'), data: data.toString('base64') };
}

/** Det förseglade tillståndet, eller null om det inte går att öppna med den här nyckeln. */
export function oppna(forseglat, token) {
  try {
    const dechiffer = createDecipheriv('aes-256-gcm', nyckelUr(token), Buffer.from(forseglat.iv, 'base64'));
    dechiffer.setAuthTag(Buffer.from(forseglat.tag, 'base64'));
    const text = Buffer.concat([dechiffer.update(Buffer.from(forseglat.data, 'base64')), dechiffer.final()]).toString('utf8');
    return JSON.parse(text);
  } catch {
    return null;
  }
}
