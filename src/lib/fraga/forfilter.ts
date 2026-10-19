// Förfiltret stoppar frågor som aldrig ska till modellen, och är reserv när modellen saknas.
// Korta ord fångas som hela ord, med sina böjningar utskrivna: "toppen" är inte "topp", och
// "vd-assistenter", "AI-receptionister" och "Discord-botar" är AI-frågor, inte kontakt, recept eller
// föreningen. Långa stammar som "introducera" och "kontaktperson" fångas i början av ett ord.
// Första listan som träffar vinner.

import { normalisera } from '../sok.ts';

export type Forfilter = 'ranking' | 'kontakt' | 'opensverige' | 'utanfor';

const RANKING = ['bast', 'basta', 'topp', 'topplista', 'ledande', 'framsta', 'best', 'leading', 'top'];
// Stammen tar böjningarna: rekommendera, rekommenderar, rekommenderade.
const RANKING_STAM = 'rekommender';

const KONTAKT = [
  'introducera', 'introduce', 'presentera mig', 'kontaktuppgift', 'kontaktperson', 'telefonnummer',
  // Bestämd form har ett m: telefonnumret, telefonnumren.
  'telefonnumr',
  'mejladress',
];
const KONTAKT_ORD = new Set(['vd', 'vd:n', 'vdn', 'ceo', 'ceon', 'e-post', 'e-posten', 'e-postadress', 'e-postadressen', 'epost', 'epostadress']);

const OPENSVERIGE = ['opensverige', 'open sverige', 'foreningen', 'tech embassy', 'lagga till', 'lagger till', 'lagg till', 'ratta', 'mitt bolag pa kartan'];
const OPENSVERIGE_ORD = new Set([
  'medlem', 'medlemmen', 'medlemmar', 'medlemmarna', 'medlemskap', 'medlemskapet', 'medlemsavgift', 'medlemsavgiften',
  'discord', 'discorden', 'discords',
]);

const UTANFOR_ORD = new Set([
  'vader', 'vadret', 'vadrets', 'recept', 'receptet', 'recepten', 'dikt', 'dikten', 'dikter',
  'aktiekurs', 'aktiekursen', 'aktiekurser', 'aktiekurserna', 'fotboll', 'fotbollen', 'horoskop', 'horoskopet', 'horoskopen',
]);

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
  'gpu', 'grafikkort', 'hosting', 'hosta', 'datacenter', 'datahall', 'moln', 'cloud', 'compute',
  'berakningskraft', 'berakningskapacitet', 'inferens', 'inference', 'hpc', 'superdator', 'kluster', 'colocation',
  'infrastruktur', 'h100', 'h200', 'a100', 'b200',
];
// Servrar som hela ord, och inte när frågan gäller MCP, som är något man bygger, inte hyr.
const INFRA_SERVER = new Set(['server', 'servern', 'servrar', 'servrarna', 'serverhall', 'serverhallar']);

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

/** Orden i frågan. Bindestreck och kolon inuti ett ord behålls, så att "vd-assistenter" förblir ett ord. */
function hela(fraga: string): string[] {
  return normalisera(fraga)
    .split(/[^a-z0-9:-]+/)
    .map((t) => t.replace(/^[-:]+|[-:]+$/g, ''))
    .filter(Boolean);
}

function harHelt(fraga: string, ord: ReadonlySet<string>): boolean {
  return hela(fraga).some((t) => ord.has(t));
}

export function forfilter(fraga: string): Forfilter | null {
  const text = rensa(fraga);
  if (RANKING.some((ord) => heltOrd(text, ord)) || ordstart(text, RANKING_STAM)) return 'ranking';
  if (traffarOrd(text, KONTAKT) || harHelt(fraga, KONTAKT_ORD)) return 'kontakt';
  if (traffarOrd(text, OPENSVERIGE) || harHelt(fraga, OPENSVERIGE_ORD)) return 'opensverige';
  if (harHelt(fraga, UTANFOR_ORD)) return 'utanfor';
  return null;
}

export function faqUtanModell(fraga: string): string[] {
  const text = rensa(fraga);
  const traffar = FAQ.filter((post) => traffarOrd(text, post.ord)).map((post) => post.id);
  return traffar.length ? traffar : ['vad-ar-opensverige'];
}

export function arInfrafraga(fraga: string): boolean {
  if (traffarOrd(rensa(fraga), INFRA)) return true;
  const ord = hela(fraga);
  return !ord.includes('mcp') && ord.some((t) => INFRA_SERVER.has(t));
}

export function arManniska(fraga: string): boolean {
  return traffarOrd(rensa(fraga), MANNISKA);
}
