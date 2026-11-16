// Organisationer med besöksadress i samma hus har samma koordinat. På kartan får var och en sin
// egen prick, tätt ihop runt adressen. En gemensam prick med ett antal i gömde alla utom en.
// Var prickarna hamnar och vad som skrivs vid dem står här, utan webbläsare, så att det går att pröva.

/**
 * Avståndet mellan två prickars mittpunkter, i bildpunkter. Pricken är 27 bred med sin vita kant,
 * så kanterna går i varandra och gruppen läses som en.
 */
export const STEG = 24;

/** Samma avstånd när någon i gruppen ritas som ikon. Ikonen är 40 bred. */
export const STEG_IKON = 38;

export interface Adresspost {
  id: string;
  n: string;
  t: string;
  lat: number | null;
  lng: number | null;
  pt: string | null;
}

export interface Adressplats {
  /** Hur många som delar adressen, den här inräknad. */
  antal: number;
  /** Prickens plats räknat från adressen, i bildpunkter åt höger och nedåt. */
  dx: number;
  dy: number;
  /** Texten vid gruppen. Den första i bokstavsordning bär den, de andra har en tom. */
  etikett: string;
  /** Gruppens översta och nedersta mittpunkt, i bildpunkter från adressen. Texten ställs efter dem. */
  topp: number;
  botten: number;
}

/** Två decimaler räcker för en bildpunkt. Nollan får aldrig minustecken, så att platser går att jämföra. */
const avrunda = (tal: number): number => Math.round(tal * 100) / 100 + 0;

/**
 * Platserna för `antal` prickar runt en adress, i läsordning: uppifrån och ner, från vänster.
 * Upp till fem står i en ring. Är de fler står en i mitten och resten i ringar utanför, sex i
 * den första och tolv i nästa. Gruppen har alltid adressen i mitten.
 */
export function adressplatser(antal: number, steg: number = STEG): [number, number][] {
  if (antal <= 1) return [[0, 0]];
  const platser: [number, number][] = [];
  const ring = (n: number, radie: number): void => {
    // Jämnt antal ger en plan översida, så att två står bredvid varandra. Udda ger en prick överst.
    const start = -Math.PI / 2 + (n % 2 === 0 ? Math.PI / n : 0);
    for (let i = 0; i < n; i++) {
      const vinkel = start + (i * 2 * Math.PI) / n;
      platser.push([avrunda(radie * Math.cos(vinkel)), avrunda(radie * Math.sin(vinkel))]);
    }
  };
  if (antal <= 5) {
    ring(antal, steg / (2 * Math.sin(Math.PI / antal)));
  } else {
    platser.push([0, 0]);
    for (let varv = 1, kvar = antal - 1; kvar > 0; varv++) {
      const n = Math.min(kvar, 6 * varv);
      ring(n, varv * steg);
      kvar -= n;
    }
  }
  return platser.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
}

/**
 * Texten vid en adress som flera delar. Två ryms med namn, i samma ordning som prickarna står.
 * Är de fler skrivs antalet: kartan väljer inte vem som nämns.
 */
export function adressetikett(namn: string[]): string {
  return namn.length <= 2 ? namn.join(' · ') : `${namn.length} på samma adress`;
}

/**
 * Var varje organisation ritas i förhållande till sin adress. De som är ensamma på sin adress,
 * eller saknar exakt adress, står kvar på sin punkt. `harIkon` svarar om en typ ritas som ikon.
 */
export function delaAdresser<T extends Adresspost>(poster: T[], harIkon: (typ: string) => boolean = () => false): Map<string, Adressplats> {
  const perPunkt = new Map<string, T[]>();
  for (const o of poster) {
    if (o.pt !== 'exakt' || o.lat === null || o.lng === null) continue;
    const punkt = `${o.lat},${o.lng}`;
    perPunkt.set(punkt, [...(perPunkt.get(punkt) ?? []), o]);
  }
  const ut = new Map<string, Adressplats>();
  for (const o of poster) ut.set(o.id, { antal: 1, dx: 0, dy: 0, etikett: o.n, topp: 0, botten: 0 });
  for (const grannar of perPunkt.values()) {
    if (grannar.length < 2) continue;
    const ordnade = grannar.slice().sort((a, b) => a.n.localeCompare(b.n, 'sv'));
    const platser = adressplatser(ordnade.length, ordnade.some((o) => harIkon(o.t)) ? STEG_IKON : STEG);
    const topp = Math.min(...platser.map((p) => p[1]));
    const botten = Math.max(...platser.map((p) => p[1]));
    const etikett = adressetikett(ordnade.map((o) => o.n));
    ordnade.forEach((o, i) => {
      ut.set(o.id, { antal: ordnade.length, dx: platser[i][0], dy: platser[i][1], etikett: i === 0 ? etikett : '', topp, botten });
    });
  }
  return ut;
}
