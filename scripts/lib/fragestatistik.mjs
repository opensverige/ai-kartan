// Frågestatistiken: Fråga kartans loggrader räknade till antal per dag, för öppen publicering.
// Loggraden bär bara svarets sort, om modellen svarade, modellens fel och frågans ämne i kartans
// egna ord (src/lib/fraga/handler.ts). Här räknas varje dimension för sig. Inga klockslag, inga
// id:n och inga kombinationer sparas, och ingen rad ur loggen skrivs ut, inte ens vid fel.

/** Vercels gratisplan sparar loggen i en timme. Marginalen tar höjd för att körningen startar sent. */
export const LAGRING_MS = 55 * 60 * 1000;
/** Loggen når Vercel med viss fördröjning. Det senaste fönstret väntar därför till nästa körning. */
export const FORDROJNING_MS = 2 * 60 * 1000;
/** Högst så många rader hämtas per körning. Fylls gränsen kan rader saknas, och det sägs som en lucka. */
export const MAX_RADER = 1000;

const SORTER = new Set(['traffar', 'bred', 'tomt', 'manniska', 'ranking', 'kontakt', 'opensverige', 'utanfor', 'data-saknas', 'motorfel']);
const MODELLFEL = new Set(['saknas', 'slut', 'nyckel', 'modell', 'tak', 'begransad', 'nere', 'tidsgrans', 'ogiltig']);
/** Fel som pausar AI-tolkningen eller betyder att leverantören är nere. Ett larm per fel och dag. */
export const LARMFEL = new Set(['saknas', 'slut', 'nyckel', 'modell', 'tak', 'nere']);
const NYCKEL = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const LAN = /^\d{2}$/;

export function tomStatistik() {
  return {
    beskrivning:
      'Fråga kartan på karta.opensverige.se, räknat per dag i svensk tid. Varje dimension räknas för sig, utan klockslag och utan kombinationer. Frågornas text sparas aldrig.',
    metod: 'https://karta.opensverige.se/integritet#fraga',
    /** Från när siffrorna gäller. Frågor före den första körningen är inte räknade. */
    start: null,
    markor: null,
    dagar: {},
    luckor: [],
    larmat: {},
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
export function laggTill(statistik, rader, { fran, till, lucka }, antalHamtade) {
  const s = structuredClone(statistik);
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
  return { statistik: s, nyaLarm, nyaLuckor: s.luckor.slice(statistik.luckor.length) };
}

/** Rapporten i Actions-loggen och i larmärendet. Bara antal, aldrig rader ur loggen. */
export function rapport({ fran, till }, rader, kastade, nyaLarm, nyaLuckor) {
  const delar = [
    `Fönster: ${new Date(fran).toISOString()} till ${new Date(till).toISOString()}`,
    `Frågor i fönstret: ${rader.filter((r) => r.tid >= fran && r.tid < till).length}`,
    `Kastade rader: ${kastade}`,
  ];
  for (const l of nyaLarm) delar.push(`Modellfel ${l.modellfel} för första gången ${l.dag}`);
  for (const l of nyaLuckor) delar.push(`Lucka (${l.orsak}): ${l.fran} till ${l.till}`);
  return delar.join('\n');
}
