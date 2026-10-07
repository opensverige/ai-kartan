// Granskningslistan: det en människa bockar av innan en organisation får gå in på kartan.
//
// Varje pull request som rör en fil i data/organisationer får en kommentar med kriterierna
// per organisation. Kontrollen blir grön först när varje punkt är avbockad.
// Kriterierna själva står i kriterier.md. Den här filen bestämmer bara hur listan ser ut och
// hur den läses av. Körningen som använder den är scripts/lib/granskningskorning.mjs.
//
// Allt som kommer ur en pull request är opålitligt: filnamn, namn, länkar och rubriker.
// En punkt känns därför igen på en dold markör som bara den här koden skriver, och text ur
// filerna rensas så att den inte kan bilda en egen rad, en egen markör eller en länk.
// Markören bär en kontrollsumma av hela filens text. En bock gäller alltså exakt den text
// som visades när den sattes, och ingen annan.

import { createHash } from 'node:crypto';

/** Står först i kommentaren. Så hittar flödet sin egen kommentar igen. */
export const MARKOR = '<!-- granskning-mot-kriterierna -->';
/** Namnet på kontrollen som syns på pull requesten och som kan göras tvingande. */
export const KONTEXT = 'Granskning mot kriterierna';
/** Fler organisationer än så här i en pull request går inte att granska ordentligt. */
export const MAX_ORGANISATIONER = 30;
/** Så lång får kommentaren bli. GitHub tar emot 262 144 byte. */
export const MAX_BYTE = 200_000;
/** Står i en kommentar som ber om uppdelning i stället för att visa en lista. */
const DELA = '<!-- granskning-dela-upp -->';

// Punkterna för en ny organisation är granskningslistan i kriterier.md, ord för ord. Ett test
// jämför dem. Sista punkten där, att valideringen är grön, prövas av CI och är ingen ruta här.
const NY = [
  ['k1', 'Kriterium 1: svensk registrering framgår av källa (register, egen sida eller oberoende sida som speglar register).'],
  ['k2', 'Kriterium 2: minst ett belägg som visar något byggt med AI, inte bara användning.'],
  ['k3', 'Kriterium 3: webbplats och belägg svarar; organisationen är inte avregistrerad.'],
  ['kalla', 'Varje fält har källa, datum och status; egen webbplats ger högst `claimed`.'],
  ['pu', 'Inga personuppgifter. Enskild firma har `self_submitted: true` och inga koordinater.'],
  ['neutral', 'Beskrivningen är neutral och beskriver vad som byggs.'],
];
const ANDRAD = [
  ['kalla', 'Varje ändrad uppgift har en källa som visar det nya värdet.'],
  ['kvar', 'Organisationen uppfyller fortfarande de tre kriterierna.'],
  ['pu', 'Inga personuppgifter, och beskrivningen är neutral och beskriver vad som byggs.'],
];
const BORTTAGEN = [['bort', 'Borttagningen är begärd av organisationen eller följer av kriterium 3.']];
export const PUNKTER = { ny: NY, andrad: ANDRAD, borttagen: BORTTAGEN };

/** Svenska ord för källtyper och sorters belägg, som i data/taxonomi. Okända värden visas rensade. */
const KALLTYP = { company_register: 'företagsregister', regulator: 'myndighet', third_party: 'tredje part', academic: 'akademisk publikation', infra_dataset: 'AI-Infra', own_site: 'egen webbplats', own_docs: 'egen dokumentation' };
const BELAGG = { produkt: 'produkt eller tjänst', repo: 'kodförråd', modell: 'publicerad modell', dataset: 'publicerat dataset', demo: 'demo', publikation: 'publikation', case: 'dokumenterat case', resurs: 'resurs eller infrastruktur', program: 'program eller utlysning', portfolj: 'portfölj' };
const ord = (tabell, varde) => (typeof varde === 'string' && Object.hasOwn(tabell, varde) ? tabell[varde] : ren(varde, 30));

const idUr = (sokvag) => String(sokvag).replace(/^data\/organisationer\//, '').replace(/\.ya?ml$/, '');
const idFor = (fil) => idUr(fil.sokvag);
/** Det nya id:t när en post byter namn, eller null. Bara ett giltigt id skrivs ut. */
function nyttId(fil) {
  const id = fil.ersattAv ? idUr(fil.ersattAv) : '';
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(id) ? id : null;
}

function punkterFor(fil) {
  if (fil.status === 'added') return NY;
  if (fil.status !== 'removed') return ANDRAD;
  const nytt = nyttId(fil);
  if (!nytt) return BORTTAGEN;
  return [['bort', `Posten försvinner under det här id:t och ersätts av \`${nytt}\`. Det är samma organisation, eller så är borttagningen begärd eller följer av kriterium 3.`]];
}

export function arOrganisationsfil(sokvag) {
  return /^data\/organisationer\/[a-z0-9]+(-[a-z0-9]+)*\.ya?ml$/.test(String(sokvag));
}

/** Sant för allt som ligger i mappen, även det som inte är en giltig organisationsfil. */
export function iOrganisationsmappen(sokvag) {
  return String(sokvag).startsWith('data/organisationer/');
}

/** Filer som bestämmer vem som får vara med och hur det prövas. De granskas inte av den här listan. */
export function arRegelfil(sokvag) {
  return /^(kriterier\.md$|schema\/|data\/taxonomi\/|scripts\/validera\.mjs$|scripts\/granskning\.mjs$|scripts\/lib\/granskning[^/]*\.mjs$|\.github\/workflows\/)/.test(String(sokvag));
}

/** En rad text utan tecken som styr Markdown eller HTML, högst `max` tecken. Annat än text blir tomt. */
export function ren(text, max = 80) {
  let t = typeof text === 'string' ? text : typeof text === 'number' && Number.isFinite(text) ? String(text) : '';
  t = t
    .slice(0, 4000)
    // Fullbreddstecken och liknande viks till vanliga tecken först, så att de rensas som dem.
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, ' ')
    // Osynliga tecken och tecken som vänder textriktningen.
    .replace(/[\u00ad\u061c\u180e\u200b-\u200f\u202a-\u202f\u2060-\u206f\ufeff]/g, '');
  // Det som tas bort kan lämna en adress efter sig. Rensa därför tills inget mer ändras.
  for (let varv = 0; varv < 20; varv++) {
    const fore = t;
    t = t
      .replace(/[<>`*_[\]()#|@~\\!]/g, '')
      .replace(/:\/\//g, ' ')
      .replace(/\bw+\.(?=\S)/gi, (m) => (m.length >= 4 ? '' : m));
    if (t === fore) break;
  }
  return t.replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Adressen om den är en vanlig webbadress som går att skriva som länk, annars null. */
export function sakerLank(url) {
  if (typeof url !== 'string' || url.length > 300 || !/^https?:\/\/[A-Za-z0-9._~:/?#@!$&'*+,;=%-]+$/.test(url)) return null;
  // Ett användarnamn före värden får adressen att se ut att gå någon annanstans än den gör.
  if (url.split('//')[1].split(/[/?#]/)[0].includes('@')) return null;
  try {
    const u = new URL(url);
    return u.username || u.password || !u.hostname ? null : url;
  } catch {
    return null;
  }
}

/** Värdnamnet står i klartext före länken, så att det syns vart den går. */
const lank = (url) => (sakerLank(url) ? `\`${new URL(url).hostname.replace(/[^A-Za-z0-9.:-]/g, '').slice(0, 100)}\` <${url}>` : '(adressen går inte att visa som länk)');

/**
 * Kontrollsumman som markören bär. Den räknas på status och hela filens text, så att en bock
 * bara gäller den text som visades och bara den lista (ny, ändrad eller borttagen) den sattes i.
 */
export function version(status, text) {
  return createHash('sha256').update(`${status}\n${text}`).digest('hex');
}

function markor(fil, nyckel) {
  if (!/^[0-9a-f]{64}$/.test(String(fil.version))) throw new Error(`Filen ${idFor(fil)} saknar version och går inte att lista.`);
  return `<!-- g:${idFor(fil)}:${fil.version}:${nyckel} -->`;
}

/** Vilka punkter som finns i en kommentar och om de är avbockade. Bara rader med vår markör räknas. */
export function rutor(kropp) {
  const ut = new Map();
  for (const rad of String(kropp ?? '').split('\n')) {
    const m = rad.match(/^- \[( |x|X)\] [^\n]* (<!-- g:[a-z0-9-]+:[0-9a-f]{64}:[a-z0-9]+ -->)\s*$/);
    // Samma markör två gånger betyder att någon har klippt och klistrat. Då gäller den inte.
    if (m) ut.set(m[2], ut.has(m[2]) ? null : m[1] !== ' ');
  }
  return ut;
}

/** Det filen själv säger om ett fälts status. Flödet har inte prövat det. */
function angiven(falt) {
  const status = ren(falt?.status, 20);
  if (!status) return 'filen anger ingen status';
  const kalltyp = ord(KALLTYP, falt?.source_type);
  return `filen anger ${status}${kalltyp ? `, källtyp ${kalltyp}` : ''}${falt?.source_url ? `. Källa: ${lank(falt.source_url)}` : ''}`;
}

function underlag(fil) {
  const data = fil.data;
  if (fil.fel || !data || typeof data !== 'object' || Array.isArray(data)) return ['> Filen gick inte att läsa. Valideringen stoppar den tills den är rättad.'];
  const rader = [
    `> Namn enligt filen: ${ren(data.name?.value) || 'saknas'}`,
    `> Typ enligt filen: ${ren(data.type?.value, 30) || 'saknas'}`,
    `> Organisationsnummer: ${data.org_number && typeof data.org_number === 'object' ? angiven(data.org_number) : 'saknas'}`,
    `> Beskrivning enligt filen: ${ren(data.description?.value, 400) || 'saknas'}`,
    `> Webbplats: ${lank(data.website)}`,
  ];
  if (data.type?.value === 'enskild_firma') rader.push('> **Enskild firma.** En sådan post får bara skapas av personen själv, och tas tills vidare inte emot alls.');
  const alla = Array.isArray(data.evidence) ? data.evidence : [];
  rader.push(alla.length ? `> Belägg (${alla.length}):` : '> Belägg: inga');
  for (const b of alla.slice(0, 8)) rader.push(`> - ${ord(BELAGG, b?.kind) || 'okänd sort'}: ${lank(b?.url)} ${ren(b?.title, 70)}`.trimEnd());
  return rader;
}

const delaUpp = (huvud, text) => [...huvud, text, '', DELA].join('\n');

/**
 * Kommentaren för en pull request. `filer` är organisationsfilerna som ändras, med `sokvag`,
 * `status` (added, modified eller removed), `version` (se `version`), `data` (filens innehåll,
 * eller null) och för ett gammalt id som byter namn `ersattAv`. En punkt som var avbockad i
 * `tidigare` står kvar avbockad om filen är oförändrad. Markörerna i `bort` bockas ur.
 */
export function lista(filer, { repo, sha, nummer = null, ogiltiga = [], maxByte = MAX_BYTE }, tidigare = '', { bort = [] } = {}) {
  const huvud = [MARKOR, `## ${KONTEXT}`, ''];
  if (filer.length > MAX_ORGANISATIONER) {
    return delaUpp(huvud, `Den här pull requesten rör ${filer.length} organisationer. Det är fler än en människa kan granska ordentligt på en gång. Dela upp den i delar om högst ${MAX_ORGANISATIONER}.`);
  }
  const avbockade = rutor(tidigare);
  for (const m of bort) avbockade.set(m, false);
  const ut = [...huvud];
  if (ogiltiga.length) {
    ut.push('**Det här får inte ligga i `data/organisationer`.** Kontrollen är röd tills det är borta eller rättat.', '');
    for (const o of ogiltiga.slice(0, 20)) ut.push(`- \`${ren(o.sokvag, 120)}\`: ${ren(o.skal, 120)}`);
    if (ogiltiga.length > 20) ut.push(`- och ${ogiltiga.length - 20} till`);
    ut.push('');
  }
  if (filer.length) {
    ut.push(
      `Den här pull requesten rör ${filer.length} ${filer.length === 1 ? 'organisation' : 'organisationer'}. Kontrollen blir grön först när en människa har bockat av varje punkt. [Kriterierna](https://github.com/${repo}/blob/main/kriterier.md) gäller, inga andra. Ett avslag skrivs som en kommentar med hänvisning till kriteriet.`,
      '',
      'AI får hjälpa till att kontrollera att ett belägg visar det som påstås, men bockar aldrig av listan. Att `npm run validera` är grön prövas av en egen kontroll.',
    );
  }
  for (const fil of filer) {
    const id = idFor(fil);
    const hur = fil.status === 'removed' ? (nyttId(fil) ? `ersätts av \`${nyttId(fil)}\`` : 'tas bort') : fil.status === 'added' ? 'ny' : 'ändrad';
    ut.push('', `### \`${id}\` · ${hur}`, '');
    if (fil.status !== 'removed') {
      const lankar = [`[Filen i den här versionen](https://github.com/${repo}/blob/${sha}/${fil.sokvag})`];
      if (fil.status === 'modified' && nummer) lankar.push(`[ändringen](https://github.com/${repo}/pull/${nummer}/files#diff-${createHash('sha256').update(fil.sokvag).digest('hex')})`);
      ut.push(`${lankar.join(' · ')}. Det här står i filen. Ingen maskin har öppnat källorna åt dig.`, '', ...underlag(fil), '');
    }
    for (const [nyckel, text] of punkterFor(fil)) {
      const m = markor(fil, nyckel);
      ut.push(`- [${avbockade.get(m) ? 'x' : ' '}] ${text} ${m}`);
    }
  }
  if (filer.length) ut.push('', '_Punkterna för en organisation nollställs när dess fil ändras._');
  const text = ut.join('\n');
  if (Buffer.byteLength(text) > maxByte) {
    return delaUpp(huvud, `Den här pull requesten rör ${filer.length} organisationer, och listan blir för lång för en kommentar. Dela upp den i mindre delar.`);
  }
  return text;
}

/** Läser av en kommentar mot de punkter som ska finnas. Punkter som saknas räknas som inte avbockade. */
export function avlas(filer, kropp, { ogiltiga = [] } = {}) {
  const forManga = filer.length > MAX_ORGANISATIONER || String(kropp ?? '').includes(DELA);
  const finns = String(kropp ?? '').startsWith(MARKOR) ? rutor(kropp) : new Map();
  const kvar = [];
  let totalt = 0;
  let saknas = 0;
  for (const fil of forManga ? [] : filer) {
    for (const [nyckel] of punkterFor(fil)) {
      totalt += 1;
      const lage = finns.get(markor(fil, nyckel));
      if (lage === undefined || lage === null) saknas += 1;
      if (!lage) kvar.push({ id: idFor(fil), nyckel });
    }
  }
  return { totalt, klara: totalt - kvar.length, kvar, manipulerad: saknas > 0, forManga, ogiltiga };
}

/** Kontrollens läge och den rad som visas bredvid den. */
export function utfall(lage, vem = '', { regelfiler = false } = {}) {
  if (lage.ogiltiga?.length) {
    const forsta = ren(String(lage.ogiltiga[0].sokvag).split('/').pop(), 50);
    return { state: 'failure', description: `Får inte ligga i data/organisationer: ${forsta}${lage.ogiltiga.length > 1 ? ` och ${lage.ogiltiga.length - 1} till` : ''}`.slice(0, 140) };
  }
  if (lage.forManga) return { state: 'failure', description: `För många organisationer i en pull request. Dela upp den i delar om högst ${MAX_ORGANISATIONER}.` };
  if (lage.totalt === 0) return { state: 'success', description: regelfiler ? 'Inga organisationer ändras. Regelfiler ändras, och de granskas inte här.' : 'Inga organisationer ändras' };
  if (lage.klara < lage.totalt) return { state: 'pending', description: `${lage.klara} av ${lage.totalt} punkter avbockade av en människa` };
  const av = ren(vem, 39);
  return { state: 'success', description: `Alla ${lage.totalt} punkter avbockade${av ? `, senast av ${av}` : ''}`.slice(0, 140) };
}
