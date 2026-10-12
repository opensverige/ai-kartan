// Frågorna i kartans bottenblad och panel: färdiga urval som en besökare kan pröva med ett tryck.
// En karta med 300 prickar kräver att man redan har en fråga. Pillren visar vilka frågor den svarar på.
//
// En fråga pekar på en plats, ett område, en typ eller något som erbjuds, aldrig på en enskild
// organisation: inget rankas. Det finns en mall per sätt att skära datan, och var och en är vald för
// att ge en lista som går att läsa igenom. Antalen räknas ur datan vid bygget, och en fråga utan
// träffar ritas inte.

export interface Fragemall {
  kommun?: string;
  omrade?: string;
  typ?: string;
  erbjuder?: string;
  /** Kort text när etiketten är för lång för ett piller. */
  text?: string;
}

/** Det frågorna behöver veta om en organisation. Samma nycklar som kartposten. */
export interface Fragepost {
  t: string;
  o: string[];
  a: string[];
  k: string | null;
  kn: string | null;
}

export interface Frageetiketter {
  omrade: (id: string) => string;
  /** Typen i plural: "Finansiärer". */
  typer: (id: string) => string;
  erbjuder: (id: string) => string;
}

export interface Fraga {
  text: string;
  antal: number;
  /** Frågedelen i kartans adress, utan frågetecken: "omrade=halsa". */
  sok: string;
}

/** Filtret så som kartan läser det ur formuläret och adressen. */
export interface Fragefilter {
  q: string;
  erbjuder: string[];
  typ: string[];
  omrade: string[];
  lan: string;
  kommun: string;
}

export const FRAGEMALLAR: Fragemall[] = [
  { kommun: '1480' },
  { omrade: 'halsa', text: 'Hälsa' },
  { typ: 'finansiar' },
  { erbjuder: 'oppen_kallkod' },
];

function passar(o: Fragepost, m: Fragemall): boolean {
  if (m.kommun && o.k !== m.kommun) return false;
  if (m.omrade && !o.a.includes(m.omrade)) return false;
  if (m.typ && o.t !== m.typ) return false;
  if (m.erbjuder && !o.o.includes(m.erbjuder)) return false;
  return true;
}

/** Samma ordning som kartan skriver adressen i, så att en fråga och en delad länk ser likadana ut. */
function sokdel(m: Fragemall): string {
  const p = new URLSearchParams();
  if (m.erbjuder) p.set('erbjuder', m.erbjuder);
  if (m.typ) p.set('typ', m.typ);
  if (m.omrade) p.set('omrade', m.omrade);
  if (m.kommun) p.set('kommun', m.kommun);
  return p.toString();
}

export function fragor(mallar: Fragemall[], poster: Fragepost[], etikett: Frageetiketter): Fraga[] {
  const rad: Fraga[] = [];
  for (const m of mallar) {
    const traffar = poster.filter((o) => passar(o, m));
    if (!traffar.length) continue;
    const amne = m.omrade ? etikett.omrade(m.omrade) : m.typ ? etikett.typer(m.typ) : m.erbjuder ? etikett.erbjuder(m.erbjuder) : null;
    const plats = m.kommun ? traffar[0].kn ?? m.kommun : null;
    const text = m.text ?? (amne && plats ? `${amne} i ${plats}` : amne ?? plats);
    if (!text) continue;
    rad.push({ text, antal: traffar.length, sok: sokdel(m) });
  }
  return rad;
}

const sammaLista = (a: string[], b: string[]): boolean => a.length === b.length && a.every((x) => b.includes(x));

/** Sant när urvalet är just frågan: inget mer valt och ingen sökning. Då är pillret markerat. */
export function arVald(sok: string, f: Fragefilter): boolean {
  const p = new URLSearchParams(sok);
  const lista = (namn: string): string[] => (p.get(namn) ?? '').split(',').filter(Boolean);
  const kommun = p.get('kommun') ?? '';
  if (f.q || f.kommun !== kommun) return false;
  // En kommun ligger alltid i ett län; koden börjar med länets två siffror.
  if (f.lan !== (p.get('lan') ?? kommun.slice(0, 2))) return false;
  return sammaLista(f.erbjuder, lista('erbjuder')) && sammaLista(f.typ, lista('typ')) && sammaLista(f.omrade, lista('omrade'));
}
