// Hur en sökning tolkas och vilka organisationer den träffar. Listorna och stegen är prövade
// mot 138 sökningar som besökare kan tänkas skriva: andelen användbara svar gick från hälften
// till fyra av fem, utan att någon sökning som fungerade förut blev sämre.
//
// En sökning tolkas i tre steg, och nästa steg används bara om det förra inte ger en enda träff:
//   1. Rak: varje ord ska finnas. Kända fraser får sällskap av etiketter och synonymer.
//   2. Utan utfyllnadsord: "vem bygger drönare" blir "drönare".
//   3. Grundform: "dokumenthantering" blir "dokument", "drönarna" blir "drönar".

/** Det sökningen behöver veta om en organisation. `ns` är all sökbar text, normaliserad. */
export interface Sokpost {
  nn: string;
  ns: string;
  t: string;
  o: string[];
  a: string[];
}

/** Ett alternativ är antingen text som ska finnas, eller en etikett: typ (t), erbjuder (o) eller område (a). */
type Etikett = ['t' | 'o' | 'a', string];
type Alternativ = string | Etikett;

export interface Tolkning {
  /** Sant för en tom sökning, som släpper igenom alla. */
  tom: boolean;
  /** Varje grupp är ett ord eller en fras ur sökningen med sina alternativ. Minst ett per grupp ska träffa. */
  grupper: Alternativ[][];
  steg: 'rak' | 'utan utfyllnadsord' | 'grundform';
  /** Orden som faktiskt söktes när utfyllnadsord togs bort, som besökaren skrev dem. Annars tom. */
  visat: string;
}

export const normalisera = (s: string): string => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Engelska och vardagliga ord för taxonomins etiketter. Nyckeln är normaliserad. */
export const ALIAS: Record<string, Etikett> = {
  'computer vision': ['a', 'datorseende'], 'machine vision': ['a', 'datorseende'],
  healthcare: ['a', 'halsa'], health: ['a', 'halsa'], medtech: ['a', 'halsa'],
  defense: ['a', 'forsvar_sakerhet'], defence: ['a', 'forsvar_sakerhet'], security: ['a', 'forsvar_sakerhet'],
  robotics: ['a', 'robotik'], 'legal tech': ['a', 'juridik'], legaltech: ['a', 'juridik'], legal: ['a', 'juridik'],
  nlp: ['a', 'sprakteknik'], 'language technology': ['a', 'sprakteknik'],
  'ai agents': ['a', 'agenter_automation'], agents: ['a', 'agenter_automation'], automation: ['a', 'agenter_automation'],
  energy: ['a', 'energi_klimat'], climate: ['a', 'energi_klimat'], 'real estate': ['a', 'fastighet_bygg'], proptech: ['a', 'fastighet_bygg'],
  finance: ['a', 'fintech'], insurance: ['a', 'fintech'], retail: ['a', 'handel'], 'e-commerce': ['a', 'handel'],
  manufacturing: ['a', 'industri'], agriculture: ['a', 'jordbruk_skog'], forestry: ['a', 'jordbruk_skog'],
  'public sector': ['a', 'offentlig_sektor'], govtech: ['a', 'offentlig_sektor'], mobility: ['a', 'transport_mobilitet'],
  education: ['a', 'utbildning'], edtech: ['a', 'utbildning'],
  investors: ['t', 'finansiar'], investor: ['t', 'finansiar'], investerare: ['t', 'finansiar'], funders: ['t', 'finansiar'],
  universities: ['t', 'larosate'], university: ['t', 'larosate'],
  'government agency': ['t', 'myndighet'], 'government agencies': ['t', 'myndighet'], authority: ['t', 'myndighet'],
  municipality: ['t', 'kommun_region'], municipalities: ['t', 'kommun_region'],
  'open source': ['o', 'oppen_kallkod'], opensource: ['o', 'oppen_kallkod'],
  consulting: ['o', 'utveckling'], consultant: ['o', 'utveckling'], konsult: ['o', 'utveckling'], 'ai-konsult': ['o', 'utveckling'], byra: ['o', 'utveckling'],
  funding: ['o', 'finansiering'], grants: ['o', 'finansiering'], research: ['o', 'forskning'],
  compute: ['o', 'infrastruktur'], cloud: ['o', 'infrastruktur'], inference: ['o', 'infrastruktur'],
  meetup: ['o', 'community'], meetups: ['o', 'community'], courses: ['o', 'utbildning'], training: ['o', 'utbildning'],
};

/** Ord som räknas som samma sak. Ett alternativ kan vara flera ord, och då ska alla finnas. */
const SYNONYMGRUPPER: string[][] = [
  ['chatbot', 'chattbot', 'chatbotar', 'chattbotar', 'chatbots', 'ai-chatt'],
  ['llm', 'llms', 'sprakmodell', 'large language model', 'language model'],
  ['ai act', 'eu ai act', 'ai-forordning', 'ai-forordningen', 'eu ai-forordningen', 'ai-akten'],
  ['compliance', 'regelefterlevnad', 'ai-forordning', 'dataskydd'],
  ['gdpr', 'dataskydd', 'personuppgift'],
  ['sjalvkorande', 'autonom', 'autonomous', 'forarlos'],
  ['vehicles', 'fordon', 'lastbil', 'korning'],
  ['vc', 'riskkapital', 'venture capital'],
  ['inkubator', 'incubator', 'accelerator'],
  ['machine learning', 'maskininlarning'],
  ['taligenkanning', 'tal till text', 'speech to text', 'speech recognition', 'transkribering', 'transkriber'],
  ['cybersakerhet', 'cybersecurity', 'cyber', 'hotmodell', 'it-sakerhet'],
  ['superdator', 'supercomputer', 'hpc', 'high performance computing'],
  ['dronare', 'drone', 'drones'],
  ['data center', 'datacenter', 'datahall'],
  ['bidrag', 'utlysning', 'forskningsmedel', 'grants'],
  ['aldreomsorg', 'omsorg', 'hemtjanst'],
  ['startup', 'startups', 'start-up'],
];
const SYNONYMER = new Map<string, string[]>();
for (const grupp of SYNONYMGRUPPER) for (const ord of grupp) SYNONYMER.set(ord, [...new Set([...(SYNONYMER.get(ord) ?? []), ...grupp])]);

/** Längst först, så att "eu ai act" hittas före "ai act". */
const FRASER = [...Object.keys(ALIAS), ...SYNONYMER.keys()].sort((a, b) => b.length - a.length);

/** Ord som sällan bär sökningen. De tas bara bort när sökningen annars inte ger något. */
const UTFYLLNAD = new Set(
  'jag vi letar soker efter ett en som vem vilka vilket vilken finns det har ar med till av att i pa och eller for inom om the a an of in who which that is are foretag bolag company companies organisation organisationer bygger utvecklar gor jobbar arbetar hyra kopa leverantor leverantorer ai-leverantor supplier vendor ai'.split(
    ' ',
  ),
);

/** En stam ska vara minst så här lång, annars träffar den för mycket. */
const MINSTA_STAM = 5;
const ANDELSER = ['arna', 'erna', 'orna', 'ar', 'er', 'or', 'en', 'et', 'na', 'n', 's'];
const SVANSAR = ['hantering', 'losningar', 'losning', 'system', 'tjanster', 'tjanst', 'verktyg', 'plattform', 'foretag', 'bolag', 'leverantor'];

function stammar(ord: string): string[] {
  const ut: string[] = [];
  for (const svans of SVANSAR) if (ord.endsWith(svans) && ord.length - svans.length >= MINSTA_STAM) ut.push(ord.slice(0, -svans.length));
  for (const andelse of ANDELSER) if (ord.endsWith(andelse) && ord.length - andelse.length >= MINSTA_STAM) ut.push(ord.slice(0, -andelse.length));
  return ut;
}

const ordgranser = new Map<string, RegExp>();
/** Ett ord på högst tre tecken ska stå i början av ett ord. Annars träffar "rag" i "storage". */
function ordTraff(o: Sokpost, ord: string): boolean {
  if (ord.length > 3) return o.ns.includes(ord);
  let monster = ordgranser.get(ord);
  if (!monster) ordgranser.set(ord, (monster = new RegExp(`(^|[^a-z0-9])${ord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)));
  return monster.test(o.ns);
}

function altTraff(o: Sokpost, alt: Alternativ): boolean {
  if (typeof alt === 'string') return alt.split(' ').every((ord) => ordTraff(o, ord));
  const [falt, varde] = alt;
  return falt === 't' ? o.t === varde : o[falt].includes(varde);
}

const gruppTraff = (o: Sokpost, grupper: Alternativ[][]): boolean => grupper.every((alternativ) => alternativ.some((alt) => altTraff(o, alt)));

/** Ordet eller frasen själv, plus etiketten och synonymerna som hör till. */
function medSlakt(ord: string): Alternativ[] {
  const alias = ALIAS[ord];
  return [ord, ...(alias ? [alias] : []), ...(SYNONYMER.get(ord) ?? [])];
}

function grupper(nq: string, alla: Sokpost[], utanUtfyllnad: boolean, medStam: boolean): Alternativ[][] {
  const ut: Alternativ[][] = [];
  let rest = ` ${nq} `;
  for (const fras of FRASER) {
    const i = rest.indexOf(` ${fras} `);
    if (i < 0) continue;
    ut.push(medSlakt(fras));
    rest = `${rest.slice(0, i)} ${rest.slice(i + fras.length + 1)}`;
  }
  const finns = (alternativ: Alternativ[]) => alla.some((o) => alternativ.some((alt) => altTraff(o, alt)));
  for (const ord of rest.split(/\s+/).filter(Boolean)) {
    if (utanUtfyllnad && UTFYLLNAD.has(ord)) continue;
    let alternativ: Alternativ[] = [ord];
    // Stammen prövas bara för ett ord som inte finns någonstans, så att exakta träffar inte späds ut.
    if (medStam && !finns(alternativ)) {
      const stam = stammar(ord).map(medSlakt).find(finns);
      if (stam) alternativ = stam;
    }
    ut.push(alternativ);
  }
  return ut;
}

/** Tolkar en sökning. `alla` behövs för att veta om en tolkning ger något alls. */
export function tolka(q: string, alla: Sokpost[]): Tolkning {
  const nq = normalisera(q.trim());
  const rak = grupper(nq, alla, false, false);
  if (!rak.length) return { tom: true, grupper: [], steg: 'rak', visat: '' };
  const ger = (g: Alternativ[][]) => g.length > 0 && alla.some((o) => gruppTraff(o, g));
  if (ger(rak)) return { tom: false, grupper: rak, steg: 'rak', visat: '' };
  const kvar = q.trim().split(/\s+/).filter((ord) => !UTFYLLNAD.has(normalisera(ord)));
  const utan = grupper(nq, alla, true, false);
  if (ger(utan)) return { tom: false, grupper: utan, steg: 'utan utfyllnadsord', visat: kvar.join(' ') };
  const stam = grupper(nq, alla, true, true);
  if (ger(stam)) return { tom: false, grupper: stam, steg: 'grundform', visat: '' };
  return { tom: false, grupper: rak, steg: 'rak', visat: '' };
}

/** Sant om organisationen passar sökningen. */
export function traffar(o: Sokpost, tolkning: Tolkning): boolean {
  return tolkning.tom || gruppTraff(o, tolkning.grupper);
}

export interface Tomt {
  sort: 'jobb' | 'regler' | 'falt';
  rubrik: string;
  text: string;
}

const SAKNAS: { sort: Tomt['sort']; ord: string[]; rubrik: string; text: string }[] = [
  {
    sort: 'jobb',
    ord: ['jobb', 'job', 'jobs', 'sommarjobb', 'lediga', 'karriar', 'career', 'careers', 'exjobb', 'internship', 'praktik', 'praktikplats', 'anstallning', 'rekrytering'],
    rubrik: 'Kartan har inga jobbannonser.',
    text: 'Den visar vilka som bygger AI. Lediga tjänster står på organisationernas egna webbplatser och i Platsbanken.',
  },
  {
    sort: 'regler',
    ord: ['foljer', 'efterlever', 'uppfyller', 'compliant', 'certifierad', 'certifierade', 'certifiering', 'iso', 'hogrisk', 'godkand', 'godkanda'],
    rubrik: 'Kartan säger inte vem som följer en regel eller har ett certifikat.',
    text: 'Det går inte att belägga med öppna källor. Sök på regelefterlevnad för att hitta dem som bygger stöd för det.',
  },
  {
    sort: 'falt',
    ord: ['pris', 'priser', 'kostnad', 'kostar', 'kunder', 'kundlista', 'anstallda', 'omsattning', 'svenskagt', 'svenskagda', 'agare'],
    rubrik: 'Kartan har inga uppgifter om pris, kunder, ägare eller antal anställda.',
    text: 'Varje post säger vad organisationen bygger, var den har sitt säte och vilka källor som visar det.',
  },
];

/**
 * Vad som ska stå när en sökning inte ger något och orden tyder på att besökaren letar efter
 * något kartan inte har. Annars null, och då gäller den vanliga texten om inga träffar.
 */
export function tomtSvar(q: string): Tomt | null {
  const ord = new Set(normalisera(q).split(/[^a-z0-9]+/).filter(Boolean));
  const svar = SAKNAS.find((s) => s.ord.some((o) => ord.has(o)));
  return svar ? { sort: svar.sort, rubrik: svar.rubrik, text: svar.text } : null;
}
