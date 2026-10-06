// Texter och strukturerad data som sökmotorer och svarsmotorer läser i sidhuvudet.

/** Så många tecken visar en sökträff ungefär innan beskrivningen klipps. */
const MAX_BESKRIVNING = 155;

/**
 * Kortar en text till en metabeskrivning. Ryms minst en hel mening tas hela meningar,
 * annars klipps texten vid ett ordmellanrum och får en ellips. En punkt räknas bara som
 * meningsslut när nästa ord börjar med versal, så att "t.ex." inte delar meningen.
 */
export function metabeskrivning(text: string, max: number = MAX_BESKRIVNING): string {
  const ren = text.replace(/\s+/g, ' ').trim();
  if (ren.length <= max) return ren;
  const meningsslut = [...ren.matchAll(/[.!?](?= [A-ZÅÄÖ0-9”"])/g)].map((m) => (m.index ?? 0) + 1).filter((i) => i <= max);
  const sista = meningsslut.at(-1);
  // En hel mening räcker om den fyller minst hälften av utrymmet. Annars säger den för lite.
  if (sista && sista >= max / 2) return ren.slice(0, sista);
  const klipp = ren.lastIndexOf(' ', max - 1);
  return `${ren.slice(0, klipp > 0 ? klipp : max - 1).replace(/[\s,;:–-]+$/, '')}…`;
}

/** Brödsmulor som schema.org BreadcrumbList. Varje steg är [namn, absolut adress]. */
export function brodsmulor(steg: [string, string][]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: steg.map(([name, item], i) => ({ '@type': 'ListItem', position: i + 1, name, item })),
  };
}
