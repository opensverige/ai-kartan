// Tar uppdrag: föreningsmedlemmar som visar att de tar uppdrag eller säljer tjänster.
//
// Profilerna ligger i föreningens medlemsdatabas hos Supabase, aldrig i det här repot. Git
// sparar allt för alltid, och en profil som tas bort ska vara borta på riktigt. Därför ritas
// korten i webbläsaren från funktionen uppdrag, och de bakas aldrig in i bygget: en gammal
// deploy hade annars haft kvar en borttagen profil. Funktionen och tabellerna ligger i
// opensverige/webbplats under supabase/. Reglerna här står utan webbläsare, så att de går att pröva.

/** Funktionen bakom korten, länken i mejlet och klickräkningen. */
export const UPPDRAG_API = 'https://kmkttmasoemqcyzkjuyv.supabase.co/functions/v1/uppdrag';

/** Där man blir medlem. Bara medlemmar kan lägga upp sig. */
export const BLI_MEDLEM = 'https://opensverige.se/bli-medlem';

/** Versionen av samtyckestexten. Funktionen sparar sin egen, och de två ska vara samma. */
export const SAMTYCKE_VERSION = '2';

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
  bolag_namn: string | null;
  bolag_webbplats: string | null;
  uppdaterad_at: string;
};

export const ERBJUDER_TEXT: Record<Erbjuder, string> = {
  uppdrag: 'Tar uppdrag',
  tjanster: 'Säljer tjänster',
  bada: 'Uppdrag och tjänster',
};

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

/** Första bokstaven i namnet, stor. Står i cirkeln på kortet och i raden i medlemsvyn. */
export function initial(namn: string): string {
  return (namn.trim()[0] ?? '·').toUpperCase();
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

/** Filtret på sidan: vad profilen erbjuder, och om den tar uppdrag på distans. */
export function passar(p: Profil, f: { erbjuder: 'alla' | 'uppdrag' | 'tjanster'; distans: boolean; omrade: string }): boolean {
  if (f.erbjuder === 'uppdrag' && p.erbjuder === 'tjanster') return false;
  if (f.erbjuder === 'tjanster' && p.erbjuder === 'uppdrag') return false;
  if (f.distans && !p.distans) return false;
  if (f.omrade && !p.omraden.includes(f.omrade)) return false;
  return true;
}
