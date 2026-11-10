// Tar uppdrag: föreningsmedlemmar som visar att de tar uppdrag eller säljer tjänster.
//
// Profilerna ligger i föreningens medlemsdatabas hos Supabase, aldrig i det här repot. Git
// sparar allt för alltid, och en profil som tas bort ska vara borta på riktigt. Därför ritas
// korten i webbläsaren från funktionen uppdrag, och de bakas aldrig in i bygget: en gammal
// deploy hade annars haft kvar en borttagen profil. Funktionen och tabellerna ligger i
// opensverige/webbplats under supabase/. Reglerna här står utan webbläsare, så att de går att pröva.
import { finnsI, normalisera } from './sok.ts';

/** Funktionen bakom korten, länken i mejlet och klickräkningen. */
export const UPPDRAG_API = 'https://kmkttmasoemqcyzkjuyv.supabase.co/functions/v1/uppdrag';

/** Där man blir medlem. Bara medlemmar kan lägga upp sig. */
export const BLI_MEDLEM = 'https://opensverige.se/bli-medlem';

/** Versionen av samtyckestexten. Funktionen sparar sin egen, och de två ska vara samma. */
export const SAMTYCKE_VERSION = '3';

export type Erbjuder = 'uppdrag' | 'tjanster' | 'bada';

export type Profil = {
  slug: string;
  namn: string;
  rubrik: string;
  lank: string;
  erbjuder: Erbjuder;
  kommun: string | null;
  distans: boolean;
  omraden: string[];
  /** Medlemmens egna ord för vad den kan, som RAG eller Python. Högst sex. */
  kunskaper: string[];
  bolag_namn: string | null;
  bolag_webbplats: string | null;
  uppdaterad_at: string;
  /** Bildens namn i föreningens lagring. Null för en profil utan bild, som visar föreningens hand. */
  bild: string | null;
};

export const ERBJUDER_TEXT: Record<Erbjuder, string> = {
  uppdrag: 'Tar uppdrag',
  tjanster: 'Säljer tjänster',
  bada: 'Uppdrag och tjänster',
};

/**
 * Adressen till profilens bild. Funktionen lämnar ut den bara så länge profilen syns i listan.
 * Bildens namn står i adressen, så en ny bild får en ny adress och den gamla kan cachas. Ett namn
 * i fel form ger ingen adress alls.
 */
export function bildUrl(p: { slug: string; bild: string | null }): string | null {
  if (!p.bild || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|jpg)$/.test(p.bild)) return null;
  return `${UPPDRAG_API}/b/${encodeURIComponent(p.slug)}?v=${p.bild}`;
}

/** Profilens länk går via funktionen, som räknar klicket och skickar vidare. */
export function klickUrl(slug: string): string {
  return `${UPPDRAG_API}/k/${encodeURIComponent(slug)}`;
}

/** Vad knappen på kortet heter: tjänstens namn när den är känd, annars värdnamnet. */
export function lankEtikett(href: string): string {
  let host = '';
  try {
    host = new URL(href).hostname.replace(/^www\./, '');
  } catch {
    return 'Länk';
  }
  if (host === 'linkedin.com' || host.endsWith('.linkedin.com')) return 'LinkedIn';
  if (host === 'github.com') return 'GitHub';
  if (host === 'x.com' || host === 'twitter.com') return 'X';
  if (host === 'huggingface.co') return 'Hugging Face';
  return host;
}

/** Tio siffror i följd är ett personnummer eller ett organisationsnummer. Samma regel som funktionen. */
export function harPersonnummer(s: string): boolean {
  return /\d{6}[-+ ]?\d{4}/.test(s);
}

/**
 * Ordningen på korten. Den roterar med dagen, så att ingen alltid står först, och den är
 * densamma för alla som tittar samma dag. Ingen kan köpa en plats, och ingen hamnar först
 * för att namnet börjar på A.
 */
export function dagensOrdning<T extends { slug: string }>(profiler: readonly T[], dag: string): T[] {
  const vikt = (s: string): number => {
    let h = 2166136261;
    for (const c of `${dag}:${s}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
    return h;
  };
  return [...profiler].sort((a, b) => vikt(a.slug) - vikt(b.slug));
}

/** Raden under namnet: kommunen och om personen tar uppdrag på distans. Tom när inget av det finns. */
export function ortrad(p: { kommun: string | null; distans: boolean }, kommuner: Record<string, string>): string {
  const ort = p.kommun ? kommuner[p.kommun] : undefined;
  if (ort) return p.distans ? `${ort} · distans` : ort;
  return p.distans ? 'Distans' : '';
}

/**
 * Profilerna per kommun, för händerna på kartan. Ordningen inom en kommun följer listan. Den som
 * bara arbetar på distans har ingen kommun och syns i listan men inte på kartan.
 */
export function perKommun<T extends { kommun: string | null }>(profiler: readonly T[]): Map<string, T[]> {
  const ut = new Map<string, T[]>();
  for (const p of profiler) {
    if (!p.kommun) continue;
    const lista = ut.get(p.kommun);
    if (lista) lista.push(p);
    else ut.set(p.kommun, [p]);
  }
  return ut;
}

/** Namnen som korten och sökningen slår upp: kommunkod till ort, och områdets id till dess etikett. */
export type Uppslag = { kommuner: Record<string, string>; omraden: Record<string, string> };

/* ---------- Kunskaper ---------- */

export const MAX_KUNSKAPER = 6;
const KUNSKAP = /^[\p{L}\p{N}.][\p{L}\p{N} .+#/&-]{0,23}$/u;

/** Ett kort ord som RAG, C# eller Node.js: högst 24 tecken, ingen länk och ingen adress. Samma regel som funktionen. */
export function giltigKunskap(s: string): boolean {
  return KUNSKAP.test(s) && !harPersonnummer(s);
}

/**
 * Listan med ett ord till. Ordet läggs inte till när det inte går igenom, när listan är full eller
 * när det redan står där, oavsett stora och små bokstäver.
 */
export function medKunskap(lista: readonly string[], ny: string): string[] {
  const ord = ny.trim().replace(/\s+/g, ' ');
  if (!giltigKunskap(ord) || lista.length >= MAX_KUNSKAPER) return [...lista];
  if (lista.some((k) => k.toLowerCase() === ord.toLowerCase())) return [...lista];
  return [...lista, ord];
}

/**
 * Ord som formuläret föreslår medan medlemmen skriver, så att samma sak stavas lika av alla och
 * går att hitta med ett val under sökfältet. Tekniker och språk, inga leverantörer: kartan lyfter
 * inte fram någons produkt.
 */
export const KUNSKAPSFORSLAG: readonly string[] = [
  'Agenter', 'RAG', 'Finjustering', 'Utvärdering', 'Promptdesign', 'MCP', 'MLOps', 'Datorseende', 'Taligenkänning',
  'Talsyntes', 'Sök', 'Vektordatabaser', 'Dataplattform', 'Automation', 'Python', 'TypeScript', 'Rust', 'Go', 'SQL',
  'Utbildning', 'Rådgivning', 'AI-förordningen', 'Informationssäkerhet', 'Produktdesign',
];

/* ---------- Sökningen ---------- */

type Sokbar = Pick<Profil, 'namn' | 'rubrik' | 'erbjuder' | 'kommun' | 'distans' | 'omraden' | 'bolag_namn'> & { kunskaper?: string[] };

/** Allt sökningen går på, normaliserat: namn, raden, kunskaper, områden, ort, distans, vad profilen erbjuder och bolag. */
export function soktext(p: Sokbar, uppslag: Uppslag): string {
  return normalisera(
    [
      p.namn,
      p.rubrik,
      ...(p.kunskaper ?? []),
      ...p.omraden.map((id) => uppslag.omraden[id] ?? ''),
      p.kommun ? (uppslag.kommuner[p.kommun] ?? '') : '',
      p.distans ? 'distans remote' : '',
      ERBJUDER_TEXT[p.erbjuder] ?? '',
      p.bolag_namn ?? '',
    ].join(' | '),
  );
}

/**
 * Profilerna som sökningen träffar, i den ordning de kom. Varje ord ska finnas någonstans i
 * profilen, och ett kort ord ska stå i början av ett ord, så att "rag" inte träffar "storage".
 * En tom sökning ger alla.
 */
export function sokProfiler<T extends Sokbar>(profiler: readonly T[], q: string, uppslag: Uppslag): T[] {
  const ord = normalisera(q).split(/[\s,]+/).filter(Boolean);
  if (!ord.length) return [...profiler];
  return profiler.filter((p) => {
    const text = soktext(p, uppslag);
    return ord.every((o) => finnsI(text, o));
  });
}

/**
 * Valen under sökfältet: orden som flest i listan har angett, kunskaper och områden blandat, och
 * Distans först när någon tar uppdrag på distans. Varje val ger minst en träff, så inget leder till
 * en tom lista. Vid lika många står orden i bokstavsordning, så raden är densamma för alla.
 */
export function snabbval(profiler: readonly Sokbar[], uppslag: Uppslag, max = 8): string[] {
  const antal = new Map<string, { text: string; n: number }>();
  for (const p of profiler) {
    const egna = new Set<string>();
    for (const text of [...(p.kunskaper ?? []), ...p.omraden.map((id) => uppslag.omraden[id] ?? '')]) {
      const nyckel = normalisera(text);
      if (!nyckel || egna.has(nyckel)) continue;
      egna.add(nyckel);
      const rad = antal.get(nyckel);
      if (rad) rad.n++;
      else antal.set(nyckel, { text, n: 1 });
    }
  }
  const ord = [...antal.values()].sort((a, b) => b.n - a.n || a.text.localeCompare(b.text, 'sv')).map((r) => r.text);
  return (profiler.some((p) => p.distans) ? ['Distans', ...ord] : ord).slice(0, max);
}

/** Ord i kartans sök som visar att besökaren letar efter en person att anlita. Normaliserade. */
const ANLITA: ReadonlySet<string> = new Set([
  'frilans', 'frilansare', 'freelance', 'freelancer', 'freelancers', 'anlita', 'tar uppdrag', 'uppdrag', 'byggare',
  'konsult', 'konsulter', 'ai-konsult', 'ai-konsulter',
]);

/**
 * Raden i kartans sök som leder till listan. Kartans sök gäller organisationer och visar aldrig
 * en medlems namn. Den säger bara hur många i listan som sökningen träffar, och skickar med
 * sökningen dit. Söker besökaren på att anlita någon gäller raden hela listan. Null när ingen
 * träffas, eller när sökningen är för kort för att säga något.
 */
export function uppdragstraff(profiler: readonly Sokbar[], q: string, uppslag: Uppslag): { antal: number; q: string } | null {
  const fraga = q.trim();
  if (fraga.length < 2 || !profiler.length) return null;
  if (ANLITA.has(normalisera(fraga))) return { antal: profiler.length, q: '' };
  const antal = sokProfiler(profiler, fraga, uppslag).length;
  return antal ? { antal, q: fraga } : null;
}

/* ---------- Hämta från länken ---------- */

export type Lanktyp = { typ: 'github'; namn: string } | { typ: 'x'; namn: string } | { typ: 'linkedin' } | { typ: 'sida'; host: string };

// Sidor hos GitHub och X som ser ut som användarnamn men inte är det.
const INTE_KONTO: ReadonlySet<string> = new Set([
  'orgs', 'features', 'about', 'pricing', 'sponsors', 'topics', 'settings', 'marketplace', 'login', 'apps', 'explore',
  'home', 'i', 'search', 'intent', 'share', 'hashtag',
]);

/**
 * Vad medlemmens länk går till, för att veta vad som går att hämta därifrån: kontot hos GitHub
 * eller X, LinkedIn som inte lämnar ut något, eller en egen sida. Null för något annat än en
 * https-adress, och för en adress hos GitHub eller X som inte är ett konto.
 */
export function lanktyp(href: string): Lanktyp | null {
  let u: URL;
  try {
    u = new URL(href);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:') return null;
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  const forsta = u.pathname.split('/').filter(Boolean)[0] ?? '';
  const konto = (monster: RegExp): string | null => (monster.test(forsta) && !INTE_KONTO.has(forsta.toLowerCase()) ? forsta : null);
  if (host === 'github.com') {
    const namn = konto(/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/);
    return namn ? { typ: 'github', namn } : null;
  }
  if (host === 'x.com' || host === 'twitter.com') {
    const namn = konto(/^[A-Za-z0-9_]{1,15}$/);
    return namn ? { typ: 'x', namn } : null;
  }
  if (host === 'linkedin.com' || host.endsWith('.linkedin.com')) return { typ: 'linkedin' };
  return host.includes('.') ? { typ: 'sida', host } : null;
}

/** Det som läses ur GitHubs lista över ett kontos öppna kodförråd. */
export type GithubForrad = { fork?: boolean; language?: string | null; topics?: string[] };

/**
 * Förslag på kunskaper ur medlemmens öppna kodförråd på GitHub: språken och ämnesorden som
 * förekommer i flest förråd. Kopior av andras förråd räknas inte. Det är förslag som medlemmen
 * väljer bland. Inget läggs till av sig självt.
 */
export function forslagFranGithub(forrad: readonly GithubForrad[], max = 8): string[] {
  const antal = new Map<string, { text: string; n: number }>();
  for (const f of forrad) {
    if (f.fork) continue;
    for (const text of [f.language, ...(f.topics ?? [])]) {
      if (typeof text !== 'string' || !giltigKunskap(text)) continue;
      const nyckel = text.toLowerCase();
      const rad = antal.get(nyckel);
      if (rad) rad.n++;
      else antal.set(nyckel, { text, n: 1 });
    }
  }
  return [...antal.values()].sort((a, b) => b.n - a.n || a.text.localeCompare(b.text, 'sv')).slice(0, max).map((r) => r.text);
}

/**
 * En rad ur en hämtad presentation, som den på GitHub: blanksteg ihopslagna och högst 90 tecken,
 * kapad vid ett ordslut. Tom när texten har en länk eller något annat som raden inte får ha.
 */
export function somRubrik(text: string): string {
  const rad = text.trim().replace(/\s+/g, ' ');
  if (!rad || /[<>]|:\/\//.test(rad) || harPersonnummer(rad)) return '';
  if (rad.length <= 90) return rad;
  const kapad = rad.slice(0, 90);
  const slut = kapad.lastIndexOf(' ');
  return (slut > 40 ? kapad.slice(0, slut) : kapad).replace(/[\s,.;:–-]+$/, '');
}
