// Hur långt en punkt ligger utanför en kommun, mätt mot de förenklade gränserna i
// public/geo/kommuner.geojson. Används av valideringen för metodens regel: ligger adressen i en
// annan kommun än sätet ritas organisationen på kommunnivå.

/** Gränserna är förenklade, så en punkt vid kusten eller kommungränsen kan hamna några hundra meter
 *  utanför. Mätt 2026-11-19: kustfallen låg som mest 1,1 km ute, de verkliga fallen 13 km och mer. */
export const GRANS_TOLERANS_M = 2000;

const M_PER_GRAD = 111320;

/**
 * @param {[number, number]} p [lng, lat]
 * @param {number[][]} ring
 */
function iRing(p, ring) {
  let inne = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inne = !inne;
  }
  return inne;
}

/** @param {{ type: string, coordinates: any }} geometri */
function polygoner(geometri) {
  return geometri.type === 'Polygon' ? [geometri.coordinates] : geometri.coordinates;
}

/** Avstånd i meter från p till sträckan a–b, i ett lokalt plan runt p. */
function tillStracka(p, a, b) {
  const k = Math.cos((p[1] * Math.PI) / 180);
  const ax = (a[0] - p[0]) * k;
  const ay = a[1] - p[1];
  const dx = (b[0] - p[0]) * k - ax;
  const dy = b[1] - p[1] - ay;
  const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(ax + t * dx, ay + t * dy) * M_PER_GRAD;
}

/**
 * 0 när punkten ligger i kommunen, annars avståndet i meter till kommunens gräns.
 * @param {[number, number]} p [lng, lat]
 * @param {{ type: string, coordinates: any }} geometri
 */
export function meterUtanfor(p, geometri) {
  const delar = polygoner(geometri);
  if (delar.some((poly) => iRing(p, poly[0]) && !poly.slice(1).some((hal) => iRing(p, hal)))) return 0;
  let minst = Infinity;
  for (const poly of delar) {
    for (const ring of poly) {
      for (let i = 1; i < ring.length; i++) minst = Math.min(minst, tillStracka(p, ring[i - 1], ring[i]));
    }
  }
  return minst;
}

/** @param {{ features: { properties: { kod: string }, geometry: any }[] }} geojson */
export function granserPerKod(geojson) {
  return new Map(geojson.features.map((f) => [f.properties.kod, f.geometry]));
}
