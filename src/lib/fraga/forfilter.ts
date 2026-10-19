// Förfiltret stoppar frågor som aldrig ska till modellen, och är reserv när modellen saknas.
// Ranking fångas som hela ord, så att "toppen" inte blir "topp". Övriga listor fångas i början
// av ett ord, så att "medlemskapet" träffar "medlemskap". Första listan som träffar vinner.

import { normalisera } from '../sok.ts';

export type Forfilter = 'ranking' | 'kontakt' | 'opensverige' | 'utanfor';

const RANKING = ['bast', 'basta', 'topp', 'topplista', 'ledande', 'framsta', 'best', 'leading', 'top'];
// Stammen tar böjningarna: rekommendera, rekommenderar, rekommenderade.
const RANKING_STAM = 'rekommender';

const KONTAKT = [
  'introducera', 'introduce', 'presentera mig', 'kontaktuppgift', 'kontaktperson', 'telefonnummer',
  // Bestämd form har ett m: telefonnumret, telefonnumren.
  'telefonnumr',
  'mejladress', 'e-post', 'epost', 'vd', 'vd:n', 'ceo',
];

const OPENSVERIGE = [
  'opensverige', 'open sverige', 'foreningen', 'medlem', 'medlemskap', 'medlemsavgift', 'discord',
  'tech embassy', 'lagga till', 'lagger till', 'lagg till', 'ratta', 'mitt bolag pa kartan',
];

const UTANFOR = ['vader', 'recept', 'dikt', 'aktiekurs', 'fotboll', 'horoskop'];

const FAQ: { id: string; ord: string[] }[] = [
  { id: 'bli-medlem', ord: ['medlem', 'ga med i foreningen'] },
  { id: 'kostnad', ord: ['kostar', 'kostnad', 'avgift', 'gratis'] },
  { id: 'discord-medlem', ord: ['discord'] },
  { id: 'bidra', ord: ['lagga till', 'lagger till', 'lagg till', 'ratta', 'bidra', 'mitt bolag'] },
  { id: 'projekt', ord: ['projekt', 'showcase'] },
  { id: 'meetups', ord: ['meetup', 'traff', 'traffar', 'demo'] },
  { id: 'opensverige-och-tech-embassy', ord: ['tech embassy'] },
  { id: 'ideell-forening', ord: ['ideell', 'foretag'] },
];

// Att hyra beräkning, hosta en modell eller köra inferens. Sådana frågor får en väg till systersajten
// AI-Infra, som jämför leverantörerna i detalj. Ordet träffar i början av ett ord: "moln" tar "molntjänst".
const INFRA = [
  'gpu', 'grafikkort', 'hosting', 'hosta', 'server', 'servrar', 'datacenter', 'datahall', 'moln', 'cloud', 'compute',
  'berakningskraft', 'berakningskapacitet', 'inferens', 'inference', 'hpc', 'superdator', 'kluster', 'colocation',
  'infrastruktur', 'h100', 'h200', 'a100', 'b200',
];

const MANNISKA = ['bolla', 'nagon att', 'sparra', 'samarbet', 'prata med', 'diskutera med', 'builders', 'hjalp av en'];

/** Skiljetecken blir mellanslag, så att "vd:n" och "e-post" delas som listorna väntar sig. */
function rensa(s: string): string {
  return normalisera(s).replace(/[^a-z0-9]+/g, ' ').trim().replace(/ +/g, ' ');
}

function heltOrd(text: string, nyckel: string): boolean {
  return text.split(' ').includes(nyckel);
}

function ordstart(text: string, nyckel: string): boolean {
  if (!nyckel) return false;
  const monster = nyckel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|\\s)${monster}`).test(text);
}

function traffarOrd(text: string, ord: readonly string[]): boolean {
  return ord.some((nyckel) => ordstart(text, rensa(nyckel)));
}

export function forfilter(fraga: string): Forfilter | null {
  const text = rensa(fraga);
  if (RANKING.some((ord) => heltOrd(text, ord)) || ordstart(text, RANKING_STAM)) return 'ranking';
  if (traffarOrd(text, KONTAKT)) return 'kontakt';
  if (traffarOrd(text, OPENSVERIGE)) return 'opensverige';
  if (traffarOrd(text, UTANFOR)) return 'utanfor';
  return null;
}

export function faqUtanModell(fraga: string): string[] {
  const text = rensa(fraga);
  const traffar = FAQ.filter((post) => traffarOrd(text, post.ord)).map((post) => post.id);
  return traffar.length ? traffar : ['vad-ar-opensverige'];
}

export function arInfrafraga(fraga: string): boolean {
  return traffarOrd(rensa(fraga), INFRA);
}

export function arManniska(fraga: string): boolean {
  return traffarOrd(rensa(fraga), MANNISKA);
}
