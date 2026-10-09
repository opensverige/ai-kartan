// Delning av en organisation: texten som föreslås och adressen till varje kanal.
// Bladet som använder dem ligger i src/components/Dela.astro. Reglerna står här, utan webbläsare,
// så att de går att pröva: scripts/delalank.mjs skriver samma text när en ny organisation har gått in.

/** Ankaret som öppnar delningsbladet i vi-form. Länken skickas till organisationen själv. */
export const ANKARE_VI = 'vi-ar-med';

const KARTAN = 'Tech Embassy, den öppna kartan över alla som bygger AI i Sverige';

/** Förslaget till text. I vi-form talar organisationen själv, annars någon som pekar på den. */
export function delatext(namn: string, vi: boolean): string {
  return vi ? `Vi finns nu på ${KARTAN}.` : `${namn} finns på ${KARTAN}.`;
}

/** Länken som öppnar organisationens sida med delningsbladet framme, i vi-form. */
export function delalank(permalank: string): string {
  return `${permalank}#${ANKARE_VI}`;
}

export type Kanal = 'linkedin' | 'x' | 'bluesky' | 'facebook' | 'epost';

export interface Delning {
  namn: string;
  text: string;
  /** Permalänken utan ankare. Det är den som ska spridas. */
  url: string;
}

/**
 * Adressen som öppnar ett nytt inlägg i kanalen. Facebook tar bara emot en länk och hämtar
 * resten ur sidans metadata. LinkedIns adress fyller i texten, och länken får därför stå i den.
 */
export function kanaladress(kanal: Kanal, { namn, text, url }: Delning): string {
  const k = encodeURIComponent;
  switch (kanal) {
    case 'linkedin':
      return `https://www.linkedin.com/feed/?shareActive=true&text=${k(`${text}\n\n${url}`)}`;
    case 'x':
      return `https://x.com/intent/post?text=${k(text)}&url=${k(url)}`;
    case 'bluesky':
      return `https://bsky.app/intent/compose?text=${k(`${text} ${url}`)}`;
    case 'facebook':
      return `https://www.facebook.com/sharer/sharer.php?u=${k(url)}`;
    case 'epost':
      return `mailto:?subject=${k(`${namn} på Tech Embassy`)}&body=${k(`${text}\n\n${url}`)}`;
  }
}

/** Text och länk i ett stycke, för den som klistrar in i en kanal som saknas här. */
export function inlagg({ text, url }: Pick<Delning, 'text' | 'url'>): string {
  return `${text}\n\n${url}`;
}
