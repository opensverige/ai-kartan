// Knuffen på kartan: ringen kring en grupp och orden Tryck på en siffra. Den hamnar på en ny
// grupp vid varje sidladdning. Alltid samma län vore att peka ut det, och kartan rankar inget.
// Reglerna för vilka grupper som kan få ringen och var orden får stå finns här, utan webbläsare,
// så att de går att pröva. Kartan avgör sedan vilken av platserna som är ledig.

/** En grupp med färre organisationer ritas för liten att träffa med tummen när hela landet är i bild. */
export const MINST_I_GRUPPEN = 5;

/** Orden står så här långt från gruppens mitt, i ringens radier, åt båda hållen. */
export const AVSTAND = 0.72;

export interface Ruta {
  /** Vänster, topp, höger och botten, i bildpunkter från kartytans övre vänstra hörn. */
  v: number;
  t: number;
  h: number;
  b: number;
}

/** Nedåt eller uppåt, till höger eller vänster om gruppen. */
export type Etikettlage = 'nh' | 'uh' | 'nv' | 'uv';

/**
 * Grupperna som kan få ringen, i slumpad ordning. Den första som syns och har plats för orden
 * får den. Finns ingen grupp som är stor nog gäller alla. `slump` ger tal från 0 upp till 1.
 */
export function knuffordning<T extends { antal: number }>(grupper: T[], slump: () => number = Math.random): T[] {
  const stora = grupper.filter((g) => g.antal >= MINST_I_GRUPPEN);
  const ordning = (stora.length ? stora : grupper).slice();
  for (let i = ordning.length - 1; i > 0; i--) {
    const j = Math.floor(slump() * (i + 1));
    [ordning[i], ordning[j]] = [ordning[j], ordning[i]];
  }
  return ordning;
}

/**
 * De fyra platserna för orden, snett utanför ringen, i den ordning de prövas. Nedåt till höger
 * först: där ligger oftast hav, medan grupperna trängs åt väster.
 */
export function etikettrutor(x: number, y: number, radie: number, bredd: number, hojd: number): [Etikettlage, Ruta][] {
  const d = radie * AVSTAND;
  return [
    ['nh', { v: x + d, t: y + d, h: x + d + bredd, b: y + d + hojd }],
    ['uh', { v: x + d, t: y - d - hojd, h: x + d + bredd, b: y - d }],
    ['nv', { v: x - d - bredd, t: y + d, h: x - d, b: y + d + hojd }],
    ['uv', { v: x - d - bredd, t: y - d - hojd, h: x - d, b: y - d }],
  ];
}

/** Sant om rutorna delar yta. Att de bara nuddar varandra räknas inte. */
export function korsar(a: Ruta, b: Ruta): boolean {
  return a.v < b.h && a.h > b.v && a.t < b.b && a.b > b.t;
}

/** Sant om hela rutan ligger inom ytan. */
export function ryms(r: Ruta, yta: Ruta): boolean {
  return r.v >= yta.v && r.h <= yta.h && r.t >= yta.t && r.b <= yta.b;
}
