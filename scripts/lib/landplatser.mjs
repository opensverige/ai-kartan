// Var organisationer ritas inom en kommun. Positionen är aldrig en adress: organisationerna
// läggs i ett rutnät runt kommunens mittpunkt, närmast mitten först. Rutor som ligger i vatten
// hoppas över, så att ingen hamnar i en sjö eller i havet. Vilka rutor som är land står i
// data/geo/land.json, som byggs av scripts/geo/bygg-land.mjs.

/** Avstånd mellan två rutor, i meter. Glest nog för att prickarna ska gå att skilja åt på kartan. */
export const STEG = 220;
/** Så långt från kommunens mittpunkt som rutnätet når, i meter. */
export const RADIE = 3000;

const METER_PER_GRAD = 111320;

/** Så långt från mittpunkten som en kommun med få organisationer breder ut sig, i meter. */
export const NARA = 1500;

const RADHOJD = (STEG * Math.sqrt(3)) / 2;

/** Rutnätets rutor i fast ordning, närmast mitten först. Räknas en gång. */
const RUTOR = (() => {
  const rader = Math.ceil(RADIE / RADHOJD);
  const kolumner = Math.ceil(RADIE / STEG) + 1;
  const rutor = [];
  for (let r = -rader; r <= rader; r++) {
    for (let k = -kolumner; k <= kolumner; k++) {
      const x = (k + (Math.abs(r) % 2) / 2) * STEG;
      const y = r * RADHOJD;
      const avstand = Math.hypot(x, y);
      if (avstand <= RADIE) rutor.push({ x, y, avstand, ordning: Math.round(avstand * 1000), vinkel: Math.round(Math.atan2(y, x) * 1e6) });
    }
  }
  return rutor.sort((a, b) => a.ordning - b.ordning || a.vinkel - b.vinkel);
})();

/**
 * Rutnätets rutor som [öst, norr] i meter från mittpunkten, närmast mitten först.
 * Rutorna ligger i sexkantsmönster, så att varje ruta har lika långt till alla sina grannar.
 * Ordningen är densamma varje gång: masken i land.json pekar ut rutor efter plats i listan.
 */
export function platsnat() {
  return RUTOR.map(({ x, y }) => [+x.toFixed(1), +y.toFixed(1)]);
}

/** Sant om rutan hör till det glesare rutnät där det är `gles` gånger så långt mellan rutorna. */
function iGlestNat({ x, y }, gles) {
  const rad = y / (RADHOJD * gles);
  if (Math.abs(rad - Math.round(rad)) > 0.01) return false;
  const kolumn = x / (STEG * gles) - (Math.abs(Math.round(rad)) % 2) / 2;
  return Math.abs(kolumn - Math.round(kolumn)) < 0.01;
}

/** Packar en lista med sant och falskt till en hexsträng, fyra rutor per tecken. */
export function packa(bitar) {
  let hex = '';
  for (let i = 0; i < bitar.length; i += 4) {
    const varde = (bitar[i] ? 8 : 0) | (bitar[i + 1] ? 4 : 0) | (bitar[i + 2] ? 2 : 0) | (bitar[i + 3] ? 1 : 0);
    hex += varde.toString(16);
  }
  return hex;
}

/** Packar upp en hexsträng från `packa` till `antal` värden. */
export function packaUpp(hex, antal) {
  const bitar = [];
  for (let i = 0; i < antal; i++) bitar.push(((parseInt(hex[i >> 2] ?? '0', 16) >> (3 - (i & 3))) & 1) === 1);
  return bitar;
}

/** Flyttar en punkt ett antal meter österut och norrut. */
export function flytta(lat, lng, ost, norr) {
  return [+(lat + norr / METER_PER_GRAD).toFixed(5), +(lng + ost / (METER_PER_GRAD * Math.cos((lat * Math.PI) / 180))).toFixed(5)];
}

/**
 * Kommunens rutor på land som [lat, lng], närmast mittpunkten först. `mask` är kommunens rad i
 * land.json. Med `antal` väljs det glesaste rutnät som rymmer så många organisationer nära
 * mitten: i en kommun med få organisationer hamnar de längre isär, så att namnen får plats.
 */
export function landplatser(kommun, mask, antal = Infinity) {
  const land = packaUpp(mask, RUTOR.length);
  const pa = RUTOR.filter((_, i) => land[i]);
  const glesa = [3, 2].map((gles) => pa.filter((ruta) => ruta.avstand <= NARA && iGlestNat(ruta, gles)));
  const valda = glesa.find((rutor) => rutor.length >= antal) ?? pa;
  return valda.map(({ x, y }) => flytta(kommun.lat, kommun.lng, x, y));
}

/** Samma tal för samma id varje gång, så att ordningen inom en kommun inte beror på filordning. */
function hash(id) {
  let h = 2166136261;
  for (const c of id) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

/**
 * Ger varje organisation i en kommun en egen plats, närmast mitten först. Ordningen mellan
 * organisationerna är godtycklig men stabil. Räcker platserna inte får de sista ingen plats.
 */
export function fordela(ids, platser) {
  const ordnade = [...ids].sort((a, b) => hash(a) - hash(b) || a.localeCompare(b));
  return new Map(ordnade.slice(0, platser.length).map((id, i) => [id, platser[i]]));
}

/**
 * Plats på land för varje organisation som ritas på kommunnivå: Map från id till { lat, lng }.
 * Organisationer med egna koordinater, utan känd kommun eller i en kommun utan rad i land.json
 * får ingen plats här.
 */
export function platserPaLand(poster, geo) {
  const perKommun = new Map();
  for (const data of poster) {
    const kod = data?.kommun?.value;
    if (!kod || data.coordinates?.value || !geo?.land?.[kod] || !geo.kommunPerKod.has(kod)) continue;
    perKommun.set(kod, [...(perKommun.get(kod) ?? []), data.id]);
  }
  const ut = new Map();
  for (const [kod, ids] of perKommun) {
    const platser = landplatser(geo.kommunPerKod.get(kod), geo.land[kod], ids.length);
    for (const [id, [lat, lng]] of fordela(ids, platser)) ut.set(id, { lat, lng });
  }
  return ut;
}
