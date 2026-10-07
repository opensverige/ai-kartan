// Läser ifyllda ärendeformulär från GitHub. Delas av skripten som tar emot nya organisationer.

import fs from 'node:fs';

/**
 * Ärendets text. I ett flöde läses den ur händelsefilen som GitHub lägger på körningen. Det som
 * skickas genom stegets env skrivs ut i körningens logg, och loggen i ett publikt repo kan läsas
 * av vem som helst som är inloggad. Ett personnummer i ärendet skulle då ligga kvar där.
 * ISSUE_BODY finns kvar för körning för hand.
 */
export function arendetext() {
  if (process.env.ISSUE_BODY) return process.env.ISSUE_BODY;
  const fil = process.env.GITHUB_EVENT_PATH;
  if (!fil || !fs.existsSync(fil)) return '';
  try {
    return String(JSON.parse(fs.readFileSync(fil, 'utf8')).issue?.body ?? '');
  } catch {
    return '';
  }
}

/** Delar upp GitHubs formulärutdata "### Etikett\n\nvärde" i ett objekt. */
export function parsa(text) {
  const ut = {};
  const delar = text.split(/^### /m).slice(1);
  for (const del of delar) {
    const [rubrik, ...rest] = del.split('\n');
    const varde = rest.join('\n').trim();
    ut[rubrik.trim()] = varde === '_No response_' ? '' : varde;
  }
  return ut;
}

/** De ikryssade rutornas text, fram till ett eventuellt tankstreck. */
export function ikryssade(text) {
  return (text || '')
    .split('\n')
    .filter((r) => /^- \[[xX]\]/.test(r))
    .map((r) => r.replace(/^- \[[xX]\]\s*/, '').split(/\s+[–-]\s+/)[0].trim());
}

export function normaliseraUrl(u) {
  u = (u || '').trim();
  if (!u) return '';
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  return u.replace(/\/+$/, '');
}

export const BORTTAGET = '[borttaget]';
// Tio eller tolv siffror, med eller utan tecken före de fyra sista: bindestreck, plus, tankstreck från
// en telefon, punkt, snedstreck eller mellanslag. Sist formen i ett momsnummer, SE följt av numret och 01.
const NUMMER = /(?<!\d)(?:(?:16|18|19|20)\d{6}|\d{6}) *[-+–—./]? *\d{4}(?!\d)|(?<=SE ?)\d{10}(?=01(?!\d))/gi;

/**
 * De nummer i texten som ser ut som personnummer eller samordningsnummer.
 * Där står månaden på tredje och fjärde plats. Juridiska personer har alltid 20 eller mer där.
 */
export function personnummerI(text) {
  return (String(text ?? '').match(NUMMER) ?? []).filter((nummer) => {
    const tio = nummer.replace(/\D/g, '').slice(-10);
    return Number(tio.slice(2, 4)) < 20;
  });
}

/** Ärendetexten med numren utbytta, eller null om det inte fanns något att ta bort. */
export function utanNummer(kropp, nummer) {
  const bort = [...new Set(nummer)].filter(Boolean);
  if (!bort.length) return null;
  let rensad = kropp;
  for (const n of bort) rensad = rensad.split(n).join(BORTTAGET);
  return rensad;
}

/** Sant om texten innehåller så många siffror att den kan vara ett nummer, inte bara utfyllnad. */
export const arNummer = (text) => (String(text ?? '').match(/\d/g) ?? []).length >= 6;
