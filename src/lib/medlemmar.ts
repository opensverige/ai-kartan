// Var OpenSveriges medlemmar finns, som antal per region. Underlaget är regionrollerna på
// föreningens Discord: varje medlem väljer själv en stad med tio mil runt om, eller "annan ort".
// Här finns aldrig personer, bara antal, och små antal skrivs inte ut som siffror.

export interface Region {
  namn: string;
  /** Kommunkoden för staden som regionen är uppkallad efter. Dess mittpunkt blir regionens. */
  kommun: string;
  antal: number;
}

/** Innehållet i data/gemenskap/regioner.json. */
export interface Medlemsdata {
  kalla: string;
  uppdaterad: string;
  radie_km: number;
  regioner: Region[];
  annan_ort: number;
}

export interface Regionvy {
  namn: string;
  lat: number;
  lng: number;
  /** Antalet som text, eller en omskrivning när det är litet. */
  visat: string;
  /** Ikonens storlek, 0,5 till 1. */
  storlek: number;
  /** Sant när ingen har valt regionen än. */
  tom: boolean;
  /** Var namnet står i förhållande till ikonen. Väster om den när en grannregion ligger nära i öster. */
  sida: 'under' | 'vanster';
}

/** Det webbläsaren får. Små antal är redan omskrivna här. */
export interface Medlemsvy {
  regioner: Regionvy[];
  annanOrt: string;
  totalt: string;
  radieKm: number;
  uppdaterad: string;
}

/** Färre än så här i en region skrivs inte ut: i en liten grupp går enskilda att peka ut. */
export const MINSTA_ANTAL = 5;

const arLitet = (antal: number): boolean => antal > 0 && antal < MINSTA_ANTAL;

export function visaAntal(antal: number): string {
  if (antal === 0) return 'ingen än';
  return arLitet(antal) ? `färre än ${MINSTA_ANTAL}` : String(antal);
}

/**
 * Summan av alla regioner och "annan ort". Är något antal dolt avrundas summan nedåt till
 * närmaste tiotal, annars går det dolda antalet att räkna fram ur resten.
 */
export function summa(antal: number[], annanOrt: number): string {
  const alla = [...antal, annanOrt];
  const total = alla.reduce((a, b) => a + b, 0);
  return alla.some(arLitet) ? `drygt ${Math.floor(total / 10) * 10}` : String(total);
}

const JORDRADIE_KM = 6371;

/** En sluten ring av [lng, lat] på `radieKm` avstånd från en punkt, räknad på klotet. */
export function cirkel(lat: number, lng: number, radieKm: number, horn = 72): [number, number][] {
  const rad = (grader: number) => (grader * Math.PI) / 180;
  const grader = (r: number) => (r * 180) / Math.PI;
  const d = radieKm / JORDRADIE_KM;
  const ring: [number, number][] = [];
  for (let i = 0; i < horn; i++) {
    const riktning = (i / horn) * Math.PI * 2;
    const lat2 = Math.asin(Math.sin(rad(lat)) * Math.cos(d) + Math.cos(rad(lat)) * Math.sin(d) * Math.cos(riktning));
    const lng2 = rad(lng) + Math.atan2(Math.sin(riktning) * Math.sin(d) * Math.cos(rad(lat)), Math.cos(d) - Math.sin(rad(lat)) * Math.sin(lat2));
    ring.push([+grader(lng2).toFixed(4), +grader(lat2).toFixed(4)]);
  }
  ring.push(ring[0]);
  return ring;
}

/** Ikonens storlek efter antal: ytan följer antalet, och den minsta är hälften så bred som den största. */
export function ikonstorlek(antal: number, storst: number): number {
  if (storst <= 0) return 1;
  return +(0.5 + 0.5 * Math.sqrt(Math.max(0, antal) / storst)).toFixed(3);
}

const SOKORD = new Set(['opensverige', 'open sverige', 'medlemmar', 'kräfta', 'kräftan', 'kräftor', 'kräftskiva', 'crayfish', 'var är vi', 'vilka är vi']);

/**
 * Sant om sökningen ska visa vägen till medlemsvyn. Bara hela ord räknas, så att den som söker
 * på "kraft" eller "open" inte får den i vägen.
 */
export function arPaskagg(q: string): boolean {
  const s = q.trim().toLowerCase().replace(/\s+/g, ' ');
  return SOKORD.has(s) || (s.length >= 6 && 'opensverige'.startsWith(s));
}

/** Avståndet mellan två punkter i kilometer, räknat på klotet. */
function kmMellan(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (grader: number) => (grader * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return JORDRADIE_KM * 2 * Math.asin(Math.sqrt(h));
}

/** Gör om underlaget till det som ritas. Kastar fel om en region pekar på en kommun som inte finns. */
export function medlemsvy(data: Medlemsdata, kommuner: { kod: string; lat: number; lng: number }[]): Medlemsvy {
  // Små antal räknas som noll när storleken bestäms, så att ikonen inte röjer dem.
  const synligt = (antal: number): number => (arLitet(antal) ? 0 : antal);
  const storst = Math.max(0, ...data.regioner.map((r) => synligt(r.antal)));
  const platser = data.regioner.map((r) => {
    const kommun = kommuner.find((k) => k.kod === r.kommun);
    if (!kommun) throw new Error(`Regionen ${r.namn} pekar på kommunkoden ${r.kommun}, som inte finns i data/geo/kommuner.json`);
    return { lat: kommun.lat, lng: kommun.lng };
  });
  // Två regioner vars cirklar går långt in i varandra har ikonerna så nära att namnen under dem
  // krockar. Den västra ställer då sitt namn väster om ikonen, bort från grannen.
  const sida = (i: number): Regionvy['sida'] => {
    const grannar = platser.filter((p, j) => j !== i && kmMellan(platser[i], p) < data.radie_km * 1.6);
    return grannar.length && grannar.every((p) => p.lng > platser[i].lng) ? 'vanster' : 'under';
  };
  return {
    regioner: data.regioner.map((r, i) => ({
      namn: r.namn,
      ...platser[i],
      visat: visaAntal(r.antal),
      storlek: ikonstorlek(synligt(r.antal), storst),
      tom: r.antal === 0,
      sida: sida(i),
    })),
    annanOrt: visaAntal(data.annan_ort),
    totalt: summa(data.regioner.map((r) => r.antal), data.annan_ort),
    radieKm: data.radie_km,
    uppdaterad: data.uppdaterad,
  };
}
