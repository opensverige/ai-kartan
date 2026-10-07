// Granskningslistan: det en människa går igenom innan en organisation får gå in på kartan.
//
// Varje pull request som rör en fil i data/organisationer får en kommentar med kriterierna
// per organisation. Kontrollen blir grön först när varje punkt är avbockad och en människa med
// skrivrätt har intygat det i en egen kommentar. Kriterierna själva står i kriterier.md.
// Den här filen bestämmer hur listan ser ut och hur den läses av. Körningen som använder den är
// scripts/lib/granskningskorning.mjs.
//
// Allt som kommer ur en pull request är opålitligt: filnamn, namn, länkar och rubriker.
// En punkt känns därför igen på en dold markör som bara den här koden skriver, och text ur
// filerna rensas så att den inte kan bilda en egen rad, en egen markör, en länk eller ett
// omnämnande. Markören bär en kontrollsumma av filens version. En bock gäller alltså exakt
// den version som visades när den sattes, och ingen annan.

import { createHash } from 'node:crypto';

/** Står först i kommentaren. Så hittar flödet sin egen kommentar igen. */
export const MARKOR = '<!-- granskning-mot-kriterierna -->';
/** Mappen där organisationerna ligger, en fil per organisation. */
export const MAPP = 'data/organisationer';
/** Namnet på kontrollen som syns på pull requesten och som kan göras tvingande. */
export const KONTEXT = 'Granskning mot kriterierna';
/** Fler organisationer än så här i en pull request går inte att granska ordentligt. */
export const MAX_ORGANISATIONER = 30;
/** Så lång får kommentaren bli. GitHub tar emot 262 144 byte. */
export const MAX_BYTE = 200_000;
/** Det en granskare skriver i en egen kommentar för att intyga att listan är genomgången. */
export const INTYG = '/granskad';
/** Står i en kommentar som ber om uppdelning i stället för att visa en lista. */
const DELA = '<!-- granskning-dela-upp -->';
/** Höjs när listans utseende ändras, så att öppna pull requests får den nya listan. */
const RITVERSION = 6;

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
// Filnamnet är id:t. En post som byter id syns därför som en borttagen och en ny i samma lista.
const BORTTAGEN = [['bort', 'Borttagningen är begärd av organisationen, följer av kriterium 3, eller så finns samma organisation kvar under ett nytt id i den här pull requesten.']];
export const PUNKTER = { ny: NY, andrad: ANDRAD, borttagen: BORTTAGEN };

/** Svenska ord för källtyper och sorters belägg, som i data/taxonomi. Okända värden visas rensade. */
const KALLTYP = { company_register: 'företagsregister', regulator: 'myndighet', third_party: 'tredje part', academic: 'akademisk publikation', infra_dataset: 'AI-Infra', own_site: 'egen webbplats', own_docs: 'egen dokumentation' };
const BELAGG = { produkt: 'produkt eller tjänst', repo: 'kodförråd', modell: 'publicerad modell', dataset: 'publicerat dataset', demo: 'demo', publikation: 'publikation', case: 'dokumenterat case', resurs: 'resurs eller infrastruktur', program: 'program eller utlysning', portfolj: 'portfölj' };
const ord = (tabell, varde) => (typeof varde === 'string' && Object.hasOwn(tabell, varde) ? tabell[varde] : kod(varde, 30));

const idUr = (sokvag) => String(sokvag).replace(/^data\/organisationer\//, '').replace(/\.ya?ml$/, '');
const idFor = (fil) => idUr(fil.sokvag);
const punkterFor = (fil) => (fil.status === 'added' ? NY : fil.status === 'removed' ? BORTTAGEN : ANDRAD);

export function arOrganisationsfil(sokvag) {
  return /^data\/organisationer\/[a-z0-9]+(-[a-z0-9]+)*\.ya?ml$/.test(String(sokvag));
}

/** Sant för allt som ligger i mappen, även det som inte är en giltig organisationsfil. */
export function iOrganisationsmappen(sokvag) {
  return String(sokvag).startsWith('data/organisationer/');
}

/**
 * Filer som bestämmer vem som får vara med och hur det prövas: kriterierna, schemat, taxonomin,
 * valideringen med det den läser genom, granskningen själv och flödena. De granskas inte av
 * den här listan, och listan säger till när de ändras.
 */
export function arRegelfil(sokvag) {
  return /^(kriterier\.md$|schema\/|data\/taxonomi\/|scripts\/validera\.mjs$|scripts\/granskning\.mjs$|scripts\/lib\/(granskning[^/]*|organisationer|belagg)\.mjs$|\.github\/workflows\/)/.test(String(sokvag));
}

/** En rad text utan tecken som styr Markdown eller HTML, högst `max` tecken. Annat än text blir tomt. */
function rensa(text, max = 80) {
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

/**
 * Som `rensa`, för text som ska stå i löpande Markdown. Ett & skrivs som &amp;, så att
 * "&commat;namn" inte blir ett omnämnande och "&num;1" inte en länk till ett ärende.
 */
export function ren(text, max = 80) {
  return rensa(text, max).replace(/&/g, '&amp;');
}

/**
 * Ett värde ur filen i kodstil, eller tom sträng. I kodstil tolkar GitHub ingenting: varken
 * omnämnanden, ärendenummer, commit-id, emoji eller formler. Värdet kan därför visas som det
 * står, med parenteser och allt. Det enda som tas bort är det som kunde avsluta kodstilen eller
 * se ut som en av listans markörer: början och slut på en HTML-kommentar, också slutet "--!>"
 * som webbläsare godtar. Ett värde som kapas slutar med tre punkter.
 */
function kod(text, max = 80) {
  let t = typeof text === 'string' ? text : typeof text === 'number' && Number.isFinite(text) ? String(text) : '';
  t = t
    .slice(0, 4000)
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, ' ')
    .replace(/[\u00ad\u061c\u180e\u200b-\u200f\u202a-\u202f\u2060-\u206f\ufeff]/g, '')
    .replace(/`/g, "'");
  // Det som tas bort kan lämna en ny början eller ett nytt slut på en kommentar efter sig:
  // "<!-<!---" blir "<!--". Ta därför bort tills inget mer ändras.
  for (let fore = null; fore !== t; ) {
    fore = t;
    t = t.replace(/<!--|--!?>/g, '');
  }
  t = t.replace(/\s+/g, ' ').trim();
  if (!t) return '';
  return `\`${t.length > max ? `${t.slice(0, max - 1)}…` : t}\``;
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

const sha256 = (text) => createHash('sha256').update(text).digest('hex');

/**
 * Kontrollsumman som markören bär. Den räknas på status och på filens version (hela blob-id:t
 * hos git, för en ändrad fil även versionen den ändras från). En bock gäller då bara den
 * version som visades, och bara den lista (ny, ändrad eller borttagen) den sattes i.
 */
export function version(status, innehall) {
  return sha256(`${status}\n${innehall}`);
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

const forMangaFiler = (filer) => filer.length > MAX_ORGANISATIONER;

/**
 * Sant om `rad` står på en egen rad i kommentaren. Listans egna rader känns igen så, och aldrig
 * som en del av en annan rad: där står text ur filerna.
 */
const harRad = (kropp, rad) => String(kropp ?? '').split('\n').some((r) => r.trim() === rad);

/** Markörerna som ska finnas i listan, i den ordning de står. */
export function forvantade(filer) {
  if (forMangaFiler(filer)) return [];
  return filer.flatMap((fil) => punkterFor(fil).map(([nyckel]) => markor(fil, nyckel)));
}

/**
 * Ett avtryck av det listan ska visa. Står i kommentaren, så att körningen ser om listan behöver
 * ritas om utan att hämta varje fil. Det är ingen spärr: vad som räknas avgörs alltid av
 * markörerna, som räknas ut ur kodförrådet och aldrig läses ur kommentaren.
 */
export function avtryck(filer, { ogiltiga = [], regelfiler = false } = {}) {
  const delar = forMangaFiler(filer) ? ['för många', filer.length] : forvantade(filer);
  return sha256(JSON.stringify([RITVERSION, delar, ogiltiga.map((o) => [o.sokvag, o.skal]), regelfiler])).slice(0, 32);
}

const avtrycksrad = (filer, lage) => `<!-- g-avtryck:${avtryck(filer, lage)} -->`;

/** Sant om kommentaren inte längre visar det den ska: annat innehåll, eller rader som saknas. */
export function behoverRitasOm(filer, lage, kropp) {
  const text = String(kropp ?? '');
  if (!text.startsWith(MARKOR) || !harRad(text, avtrycksrad(filer, lage))) return true;
  const finns = rutor(text);
  return forvantade(filer).some((m) => finns.get(m) === undefined || finns.get(m) === null);
}

/** Det filen själv säger om ett fälts status. Flödet har inte prövat det. */
function angiven(falt) {
  const status = kod(falt?.status, 20);
  if (!status) return 'filen anger ingen status';
  const kalltyp = ord(KALLTYP, falt?.source_type);
  return `filen anger ${status}${kalltyp ? `, källtyp ${kalltyp}` : ''}${falt?.source_url ? `. Källa: ${lank(falt.source_url)}` : ''}`;
}

/** Hur många anteckningar (note) filen har. De visas inte i listan, men publiceras. */
function antalAnteckningar(data, djup = 0) {
  if (!data || typeof data !== 'object' || djup > 6) return 0;
  return Object.entries(data).reduce((n, [nyckel, varde]) => n + (nyckel === 'note' && typeof varde === 'string' && varde.trim() ? 1 : antalAnteckningar(varde, djup + 1)), 0);
}

const VISADE_BELAGG = 12;

function underlag(fil) {
  const data = fil.data;
  if (fil.fel || !data || typeof data !== 'object' || Array.isArray(data)) return ['> Filen gick inte att läsa. Valideringen stoppar den tills den är rättad.'];
  const rader = [`> Namn enligt filen: ${kod(data.name?.value) || 'saknas'}`];
  if (kod(data.legal_name?.value)) rader.push(`> Registrerat namn enligt filen: ${kod(data.legal_name.value, 120)}`);
  rader.push(
    `> Typ enligt filen: ${kod(data.type?.value, 30) || 'saknas'}`,
    `> Organisationsnummer: ${data.org_number && typeof data.org_number === 'object' ? angiven(data.org_number) : 'saknas'}`,
    `> Beskrivning enligt filen: ${kod(data.description?.value, 500) || 'saknas'}`,
    `> Webbplats: ${lank(data.website)}`,
  );
  if (data.type?.value === 'enskild_firma') rader.push('> **Enskild firma.** En sådan post får bara skapas av personen själv, och tas tills vidare inte emot alls.');
  const alla = Array.isArray(data.evidence) ? data.evidence : [];
  rader.push(alla.length ? `> Belägg (${alla.length}):` : '> Belägg: inga');
  for (const b of alla.slice(0, VISADE_BELAGG)) rader.push(`> - ${ord(BELAGG, b?.kind) || 'okänd sort'}: ${lank(b?.url)} ${kod(b?.title, 90)}`.trimEnd());
  if (alla.length > VISADE_BELAGG) rader.push(`>\n> och ${alla.length - VISADE_BELAGG} belägg till`);
  // Listan visar inte allt som publiceras. Det ska stå, så att ingen intygar något den inte har läst.
  const anteckningar = antalAnteckningar(data);
  const dolt = anteckningar ? ` Filen har ${anteckningar} ${anteckningar === 1 ? 'anteckning' : 'anteckningar'} och fler fält som inte visas här.` : ' Filen har fler fält än de som visas här.';
  rader.push(`>\n> _Det här är ett utdrag.${dolt} Läs hela filen i pull requesten innan du intygar._`);
  return rader;
}

const REGELRAD = '**Pull requesten ändrar också regelfiler**: kriterier, schema, validering eller flöden. De granskas inte av den här listan.';

/**
 * Kommentaren för en pull request. `filer` är organisationsfilerna som ändras, med `sokvag`,
 * `status` (added, modified eller removed), `version` (se `version`), `data` (filens innehåll,
 * eller null). En punkt som var avbockad i `tidigare` står kvar avbockad om filen är oförändrad.
 */
export function lista(filer, { repo, nummer = null, ogiltiga = [], regelfiler = false, maxByte = MAX_BYTE }, tidigare = '') {
  const lage = { ogiltiga, regelfiler };
  const huvud = [MARKOR, `## ${KONTEXT}`, ''];
  const delaUpp = (text) => [...huvud, text, '', DELA, avtrycksrad(filer, lage)].join('\n');
  if (forMangaFiler(filer)) {
    return delaUpp(`Den här pull requesten rör ${filer.length} organisationer. Det är fler än en människa kan granska ordentligt på en gång. Dela upp den i delar om högst ${MAX_ORGANISATIONER}.`);
  }
  const avbockade = rutor(tidigare);
  const ut = [...huvud];
  if (ogiltiga.length) {
    ut.push('**Det här får inte ligga i `data/organisationer`.** Kontrollen är röd tills det är borta eller rättat.', '');
    for (const o of ogiltiga.slice(0, 20)) ut.push(`- \`${rensa(o.sokvag, 120)}\`: ${ren(o.skal, 120)}`);
    if (ogiltiga.length > 20) ut.push(`- och ${ogiltiga.length - 20} till`);
    ut.push('');
  }
  if (filer.length) {
    ut.push(
      `Den här pull requesten rör ${filer.length} ${filer.length === 1 ? 'organisation' : 'organisationer'}. [Kriterierna](https://github.com/${repo}/blob/main/kriterier.md) gäller, inga andra. Ett avslag skrivs som en kommentar med hänvisning till kriteriet.`,
      '',
      `**Så blir kontrollen grön:** öppna källorna, bocka av varje punkt, och skriv sedan \`${INTYG}\` ensamt på första raden i en ny kommentar. Bara en människa med skrivrätt i repot kan intyga. AI får hjälpa till att kontrollera att ett belägg visar det som påstås, men bockar aldrig av listan och intygar aldrig. Att \`npm run validera\` är grön prövas av en egen kontroll.`,
    );
    if (regelfiler) ut.push('', REGELRAD);
  }
  for (const fil of filer) {
    const id = idFor(fil);
    const hur = fil.status === 'removed' ? 'tas bort' : fil.status === 'added' ? 'ny' : 'ändrad';
    ut.push('', `### \`${id}\` · ${hur}`, '');
    if (fil.status !== 'removed') {
      // Länken går till pull requestens egen vy av filen. Den visar alltid den version som gäller,
      // och listan behöver då inte skrivas om för en commit som inte rör filen.
      const vy = nummer ? `[${fil.status === 'modified' ? 'Ändringen' : 'Filen'} i pull requesten](https://github.com/${repo}/pull/${nummer}/files#diff-${sha256(fil.sokvag)}). ` : '';
      ut.push(`${vy}Det här står i filen. Ingen maskin har öppnat källorna åt dig.`, '', ...underlag(fil), '');
    }
    for (const [nyckel, text] of punkterFor(fil)) {
      const m = markor(fil, nyckel);
      ut.push(`- [${avbockade.get(m) ? 'x' : ' '}] ${text} ${m}`);
    }
  }
  if (filer.length) ut.push('', `_Punkterna för en organisation nollställs när dess fil ändras. Ändras eller döljs listan efter att någon har skrivit \`${INTYG}\` behövs ett nytt intyg._`);
  ut.push('', avtrycksrad(filer, lage));
  const text = ut.join('\n');
  if (Buffer.byteLength(text) > maxByte) {
    return delaUpp(`Den här pull requesten rör ${filer.length} organisationer, och listan blir för lång för en kommentar. Dela upp den i mindre delar.`);
  }
  return text;
}

/** Läser av en kommentar mot de punkter som ska finnas. Punkter som saknas räknas som inte avbockade. */
export function avlas(filer, kropp, { ogiltiga = [] } = {}) {
  const delad = harRad(kropp, DELA);
  const forManga = forMangaFiler(filer) || delad;
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
  return { totalt, klara: totalt - kvar.length, kvar, manipulerad: saknas > 0, forManga, forLang: delad && !forMangaFiler(filer), ogiltiga };
}

/**
 * Sant om kommentaren är ett intyg: ordet står ensamt på kommentarens första rad. Resten av
 * kommentaren är fri. "/granskad inte än" är alltså inget intyg.
 */
export function arIntyg(text) {
  return new RegExp(`^\\s*${INTYG}[.!]?[ \\t]*(\\r?\\n|$)`, 'i').test(String(text ?? ''));
}

/**
 * Kontrollens läge och den rad som visas bredvid den. `intygadAv` är den människa med skrivrätt
 * som har intygat listan efter dess senaste ändring. `intygForaldrat` är sant när det finns ett
 * intyg, men listan har ändrats efter det.
 */
export function utfall(lage, { intygadAv = '', intygForaldrat = false, regelfiler = false } = {}) {
  const rad = (text) => text.slice(0, 140);
  if (lage.ogiltiga?.length) {
    if (lage.ogiltiga[0].mapp) return { state: 'failure', description: `Mappen ${MAPP} har bytts mot något annat än en vanlig mapp.` };
    const forsta = rensa(String(lage.ogiltiga[0].sokvag).split('/').pop(), 50);
    return { state: 'failure', description: rad(`Får inte ligga i data/organisationer: ${forsta}${lage.ogiltiga.length > 1 ? ` och ${lage.ogiltiga.length - 1} till` : ''}`) };
  }
  if (lage.forLang) return { state: 'failure', description: 'Listan blir för lång för en kommentar. Dela upp pull requesten i mindre delar.' };
  if (lage.forManga) return { state: 'failure', description: `För många organisationer i en pull request. Dela upp den i delar om högst ${MAX_ORGANISATIONER}.` };
  if (lage.totalt === 0) return { state: 'success', description: regelfiler ? 'Inga organisationer ändras. Regelfiler ändras, och de granskas inte här.' : 'Inga organisationer ändras' };
  const regler = regelfiler ? ' Regelfiler ändras också.' : '';
  if (lage.klara < lage.totalt) return { state: 'pending', description: rad(`${lage.klara} av ${lage.totalt} punkter avbockade.${regler}`) };
  const av = rensa(intygadAv, 39);
  if (!av) {
    return { state: 'pending', description: rad(intygForaldrat ? `Listan har ändrats eller dolts efter intyget. Skriv ${INTYG} i en ny kommentar.${regler}` : `Alla ${lage.totalt} punkter avbockade. Skriv ${INTYG} i en kommentar för att intyga.${regler}`) };
  }
  return { state: 'success', description: rad(`Alla ${lage.totalt} punkter avbockade och intygade av ${av}.${regler}`) };
}
