// Kommunytan: ett mjukt område runt de organisationer som ritas på kommunnivå. Prickarna i en
// kommun står i ett rutnät runt mittpunkten och är inga adresser, men på en gatukarta ser de ut
// som adresser. Ytan säger det som noten under kartan säger: någonstans i kommunen. Reglerna står
// här, utan karta, så att de går att pröva. Lagren som ritar ytan ligger i KartApp.astro.

export interface Ytpunkt {
  lat: number;
  lng: number;
}

/** Det ytan behöver veta om en organisation. Samma fält som i kartdatan. */
export interface Ytpost {
  k: string | null;
  kn: string | null;
  lat: number | null;
  lng: number | null;
  pt: string | null;
}

export interface Kommunyta {
  kod: string;
  namn: string;
  antal: number;
  /** Sluten ring som [lng, lat], som i GeoJSON. */
  kant: [number, number][];
  /** Där etiketten sitter: under ytan, mitt för den. Organisationernas namn står ovanför prickarna. */
  fot: [number, number];
}

/** Luften mellan den yttersta pricken och ytans kant, i meter. Lite mer än avståndet mellan två prickar. */
export const MARGINAL = 260;
const METER_PER_GRAD = 111320;
const HORN_PER_VARV = 48;

type Punkt = [number, number];

/** Det konvexa höljet moturs, utan dubbletter. En eller två punkter lämnas som de är. */
function holje(punkter: Punkt[]): Punkt[] {
  const sorterade = [...new Map(punkter.map((p) => [`${p[0]},${p[1]}`, p])).values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (sorterade.length < 3) return sorterade;
  const kors = (o: Punkt, a: Punkt, b: Punkt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const halva = (rad: Punkt[]) => {
    const ut: Punkt[] = [];
    for (const p of rad) {
      while (ut.length >= 2 && kors(ut[ut.length - 2], ut[ut.length - 1], p) <= 0) ut.pop();
      ut.push(p);
    }
    return ut.slice(0, -1);
  };
  return [...halva(sorterade), ...halva([...sorterade].reverse())];
}

/**
 * Kanten runt punkterna: det konvexa höljet vidgat med `marginal` meter, med runda hörn.
 * En ensam punkt ger en cirkel och två ger en kapsel. Ringen är sluten och står som [lng, lat].
 */
export function ytkant(punkter: Ytpunkt[], marginal: number = MARGINAL): [number, number][] {
  if (!punkter.length) return [];
  // Räknas i meter kring punkternas mitt. Över en kommun är felet mot en riktig projektion försumbart.
  const lat0 = punkter.reduce((s, p) => s + p.lat, 0) / punkter.length;
  const lng0 = punkter.reduce((s, p) => s + p.lng, 0) / punkter.length;
  const perLng = METER_PER_GRAD * Math.cos((lat0 * Math.PI) / 180);
  const horn = holje(punkter.map((p): Punkt => [Math.round((p.lng - lng0) * perLng * 10) / 10, Math.round((p.lat - lat0) * METER_PER_GRAD * 10) / 10]));
  const steg = (Math.PI * 2) / HORN_PER_VARV;
  const ring: Punkt[] = [];
  horn.forEach((h, i) => {
    const fore = horn[(i - 1 + horn.length) % horn.length];
    const efter = horn[(i + 1) % horn.length];
    // Kantens utåtriktade normal, som vinkel. Runt ett hörn sveper bågen från den ena kantens normal till den andras.
    const normal = (a: Punkt, b: Punkt) => Math.atan2(-(b[0] - a[0]), b[1] - a[1]);
    let fran = horn.length === 1 ? 0 : normal(fore, h);
    let till = horn.length === 1 ? Math.PI * 2 : normal(h, efter);
    if (horn.length > 1) {
      while (till <= fran) till += Math.PI * 2;
    }
    const antal = Math.max(1, Math.ceil((till - fran) / steg));
    for (let n = 0; n <= antal; n++) {
      const v = fran + ((till - fran) * n) / antal;
      ring.push([h[0] + marginal * Math.cos(v), h[1] + marginal * Math.sin(v)]);
    }
  });
  const ut = ring.map(([x, y]): [number, number] => [+(lng0 + x / perLng).toFixed(5), +(lat0 + y / METER_PER_GRAD).toFixed(5)]);
  ut.push(ut[0]);
  return ut;
}

/**
 * En yta per kommun, för de organisationer som ritas på kommunnivå. En organisation med exakt
 * position hör inte till ytan: den står där den finns och ska inte dra ut ytan dit.
 */
export function kommunytor(poster: Ytpost[], marginal: number = MARGINAL): Kommunyta[] {
  const perKommun = new Map<string, { namn: string; punkter: Ytpunkt[] }>();
  for (const p of poster) {
    if (!p.k || p.lat === null || p.lng === null || p.pt !== 'kommun') continue;
    if (!perKommun.has(p.k)) perKommun.set(p.k, { namn: p.kn ?? '', punkter: [] });
    perKommun.get(p.k)!.punkter.push({ lat: p.lat, lng: p.lng });
  }
  return [...perKommun.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([kod, { namn, punkter }]) => {
      const kant = ytkant(punkter, marginal);
      const lng = kant.map(([x]) => x);
      const fot: [number, number] = [+((Math.min(...lng) + Math.max(...lng)) / 2).toFixed(5), Math.min(...kant.map(([, lat]) => lat))];
      return { kod, namn, antal: punkter.length, kant, fot };
    });
}
