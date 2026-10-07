// Granskningslistan: det en människa bockar av innan en organisation får gå in på kartan.
//
// Varje pull request som rör en fil i data/organisationer får en kommentar med kriterierna
// per organisation. Pull requesten går inte att merga förrän varje punkt är avbockad.
// Kriterierna själva står i kriterier.md. Den här filen bestämmer bara hur listan ser ut och
// hur den läses av. Flödet som använder den är .github/workflows/granskning.yml.
//
// Allt som kommer ur en pull request är opålitligt: filnamn, namn, länkar och rubriker.
// En punkt känns därför igen på en dold markör som bara den här koden skriver, och text ur
// filerna rensas så att den inte kan bilda en egen rad, en egen markör eller en länk.

/** Står först i kommentaren. Så hittar flödet sin egen kommentar igen. */
export const MARKOR = '<!-- granskning-mot-kriterierna -->';
/** Namnet på kontrollen som syns på pull requesten och som kan göras tvingande. */
export const KONTEXT = 'Granskning mot kriterierna';
/** Fler organisationer än så här i en pull request går inte att granska ordentligt. */
export const MAX_ORGANISATIONER = 60;

const NY = [
  ['k1', 'Kriterium 1: svensk registrering framgår av källa.'],
  ['k2', 'Kriterium 2: minst ett belägg visar något byggt med AI, inte bara användning.'],
  ['k3', 'Kriterium 3: webbplats och belägg svarar, och organisationen är inte avregistrerad.'],
  ['pu', 'Inga personuppgifter, och beskrivningen är neutral och säger vad som byggs.'],
];
const ANDRAD = [
  ['kalla', 'Varje ändrad uppgift har en källa som visar det nya värdet.'],
  ['kvar', 'Organisationen uppfyller fortfarande de tre kriterierna.'],
  ['pu', 'Inga personuppgifter, och beskrivningen är neutral och säger vad som byggs.'],
];
const BORTTAGEN = [['bort', 'Borttagningen är begärd av organisationen eller följer av kriterium 3.']];

/** Svenska ord för källtyper och sorters belägg, som i data/taxonomi. Okända värden visas rensade. */
const KALLTYP = { company_register: 'företagsregister', regulator: 'myndighet', third_party: 'tredje part', academic: 'akademisk publikation', infra_dataset: 'AI-Infra' };
const BELAGG = { produkt: 'produkt eller tjänst', repo: 'kodförråd', modell: 'publicerad modell', dataset: 'publicerat dataset', demo: 'demo', publikation: 'publikation', case: 'dokumenterat case', resurs: 'resurs eller infrastruktur', program: 'program eller utlysning', portfolj: 'portfölj' };
const ord = (tabell, varde) => (Object.hasOwn(tabell, String(varde)) ? tabell[String(varde)] : ren(varde, 30));

const punkterFor = (status) => (status === 'removed' ? BORTTAGEN : status === 'added' ? NY : ANDRAD);

export function arOrganisationsfil(sokvag) {
  return /^data\/organisationer\/[a-z0-9]+(-[a-z0-9]+)*\.ya?ml$/.test(String(sokvag));
}

/** En rad text utan tecken som styr Markdown eller HTML, högst `max` tecken. */
export function ren(text, max = 80) {
  return String(text ?? '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/[<>`*_[\]()#|@~\\!]/g, '')
    .replace(/:\/\//g, ' ')
    .replace(/\bwww\./gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/** Adressen om den är en vanlig webbadress som går att skriva som länk, annars null. */
export function sakerLank(url) {
  if (typeof url !== 'string' || url.length > 300) return null;
  return /^https?:\/\/[A-Za-z0-9._~:/?#@!$&'*+,;=%-]+$/.test(url) ? url : null;
}

const idFor = (fil) => fil.sokvag.replace(/^data\/organisationer\//, '').replace(/\.ya?ml$/, '');
const blobFor = (fil) => (/^[0-9a-f]{7,40}$/.test(String(fil.blob)) ? String(fil.blob).slice(0, 7) : '0000000');
const markor = (fil, nyckel) => `<!-- g:${idFor(fil)}:${blobFor(fil)}:${nyckel} -->`;

/** Vilka punkter som finns i en kommentar och om de är avbockade. Bara rader med vår markör räknas. */
function rutor(kropp) {
  const ut = new Map();
  for (const rad of String(kropp ?? '').split('\n')) {
    const m = rad.match(/^- \[( |x|X)\] [^\n]* (<!-- g:[a-z0-9-]+:[0-9a-f]{7}:[a-z0-9]+ -->)\s*$/);
    // Samma markör två gånger betyder att någon har klippt och klistrat. Då gäller den inte.
    if (m) ut.set(m[2], ut.has(m[2]) ? null : m[1] !== ' ');
  }
  return ut;
}

const lank = (url) => (sakerLank(url) ? `<${url}>` : '(adressen går inte att visa som länk)');

function underlag(data) {
  if (!data || typeof data !== 'object') return ['> Filen gick inte att läsa. Valideringen stoppar den tills den är rättad.'];
  const nummer = data.org_number;
  const orgnr =
    nummer?.status === 'confirmed'
      ? `bekräftat (${ord(KALLTYP, nummer.source_type) || 'källtyp saknas'})`
      : nummer?.status === 'claimed'
        ? 'egen uppgift, inte bekräftat mot register'
        : 'saknas eller okänt';
  const rader = [
    `> Typ: ${ren(data.type?.value, 30) || 'saknas'} · organisationsnummer: ${orgnr}`,
    `> Webbplats: ${lank(data.website)}`,
  ];
  if (data.type?.value === 'enskild_firma') rader.push('> **Enskild firma.** En sådan post får bara skapas av personen själv, och tas tills vidare inte emot alls.');
  const belagg = Array.isArray(data.evidence) ? data.evidence.slice(0, 8) : [];
  rader.push(belagg.length ? `> Belägg (${Array.isArray(data.evidence) ? data.evidence.length : 0}):` : '> Belägg: inga');
  for (const b of belagg) rader.push(`> - ${ord(BELAGG, b?.kind) || 'okänd sort'}: ${lank(b?.url)} ${ren(b?.title, 70)}`.trimEnd());
  return rader;
}

/**
 * Kommentaren för en pull request. `filer` är organisationsfilerna som ändras, med `sokvag`,
 * `blob` (filens version), `status` (added, modified eller removed) och `data` (filens innehåll,
 * eller null). En punkt som var avbockad i `tidigare` står kvar avbockad om filen är oförändrad.
 */
export function lista(filer, { repo, sha }, tidigare = '') {
  const huvud = [MARKOR, `## ${KONTEXT}`, ''];
  if (filer.length > MAX_ORGANISATIONER) {
    return [...huvud, `Den här pull requesten rör ${filer.length} organisationer. Det är fler än en människa kan granska ordentligt på en gång. Dela upp den i delar om högst ${MAX_ORGANISATIONER}.`].join('\n');
  }
  const avbockade = rutor(tidigare);
  const ut = [
    ...huvud,
    `Den här pull requesten rör ${filer.length} ${filer.length === 1 ? 'organisation' : 'organisationer'}. Den går att merga först när en människa har bockat av varje punkt. [Kriterierna](https://github.com/${repo}/blob/main/kriterier.md) gäller, inga andra. Ett avslag skrivs som en kommentar med hänvisning till kriteriet.`,
    '',
    'AI får hjälpa till att kontrollera att ett belägg visar det som påstås, men bockar aldrig av listan.',
  ];
  for (const fil of filer) {
    const id = idFor(fil);
    const hur = fil.status === 'removed' ? 'tas bort' : fil.status === 'added' ? 'ny' : 'ändrad';
    const namn = ren(fil.data?.name?.value) || id;
    ut.push('', `### ${namn} (\`${id}\`) · ${hur}`, '');
    if (fil.status !== 'removed') {
      ut.push(`[Filen i den här versionen](https://github.com/${repo}/blob/${sha}/${fil.sokvag}). Det här står i den. Ingen maskin har öppnat källorna åt dig.`, '', ...underlag(fil.data), '');
    }
    for (const [nyckel, text] of punkterFor(fil.status)) {
      const m = markor(fil, nyckel);
      ut.push(`- [${avbockade.get(m) ? 'x' : ' '}] ${text} ${m}`);
    }
  }
  ut.push('', '_Punkterna för en organisation nollställs när dess fil ändras._');
  return ut.join('\n');
}

/** Läser av en kommentar mot de punkter som ska finnas. Punkter som saknas räknas som inte avbockade. */
export function avlas(filer, kropp) {
  const forManga = filer.length > MAX_ORGANISATIONER;
  const finns = String(kropp ?? '').startsWith(MARKOR) ? rutor(kropp) : new Map();
  const kvar = [];
  let totalt = 0;
  let saknas = 0;
  for (const fil of forManga ? [] : filer) {
    for (const [nyckel] of punkterFor(fil.status)) {
      totalt += 1;
      const lage = finns.get(markor(fil, nyckel));
      if (lage === undefined || lage === null) saknas += 1;
      if (!lage) kvar.push({ id: idFor(fil), nyckel });
    }
  }
  return { totalt, klara: totalt - kvar.length, kvar, manipulerad: saknas > 0, forManga };
}

/** Kontrollens läge och den rad som visas bredvid den. */
export function utfall(lage, vem = '') {
  if (lage.forManga) return { state: 'failure', description: `För många organisationer i en pull request. Dela upp den i delar om högst ${MAX_ORGANISATIONER}.` };
  if (lage.totalt === 0) return { state: 'success', description: 'Inga organisationer ändras' };
  if (lage.klara < lage.totalt) return { state: 'pending', description: `${lage.klara} av ${lage.totalt} punkter avbockade av en människa` };
  const av = ren(vem, 39);
  return { state: 'success', description: `Alla ${lage.totalt} punkter avbockade${av ? `, senast av ${av}` : ''}`.slice(0, 140) };
}
