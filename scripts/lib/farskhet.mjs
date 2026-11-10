// Regeln för när det publicerade släpar efter datan i main. Den står här, utan nätverk, så att
// den går att pröva. scripts/farskhet.mjs läser sajtens /api/status.json och anropar den.

/** Så många hela dagar får en dataändring vänta på att synas på sajten. */
export const GRANS_PUBLICERAT_DAGAR = 1;

const DAG_MS = 86400000;

/** Hela dagar från datumet till nu. Null när datumet saknas. */
export function dagarSedan(datum, nu) {
  if (!datum) return null;
  return Math.floor((nu - new Date(`${datum}T00:00:00Z`).getTime()) / DAG_MS);
}

/**
 * Släpar sajten? Den gör det när senaste dataändringen i main är senare än den sajten visar, och
 * ändringen har hunnit bli minst en dag gammal. Då har ett bygge eller historikflödet fastnat.
 * Saknas den publicerade uppgiften räknas det som att sajten släpar, eftersom ingen kan se datan.
 */
export function publiceratSlapar({ publicerad, lokal, nu }) {
  if (!lokal) return { slapar: false, dagar: null };
  const dagar = dagarSedan(lokal, nu);
  if (!publicerad) return { slapar: true, dagar };
  return { slapar: publicerad < lokal && dagar >= GRANS_PUBLICERAT_DAGAR, dagar };
}
