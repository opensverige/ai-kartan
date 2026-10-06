// Bedömer svaret på en länkkontroll. Skillnaden mellan död och onåbar är viktig:
// lärosäten och myndigheter nekar ofta trafik från molnservrar, så ett nätfel från
// GitHubs maskiner säger inget om huruvida sidan finns.

/**
 * 'ok' när sidan svarar, 'dod' när servern säger att den är borta eller domänen
 * saknas i DNS, 'onabar' när den bara inte gick att nå härifrån.
 */
export function bedomLank({ status, fel }) {
  if (status) {
    // 403 och 429 betyder att robotar nekas, inte att sidan saknas.
    if ((status >= 200 && status < 400) || status === 403 || status === 429) return 'ok';
    return status >= 500 ? 'onabar' : 'dod';
  }
  return fel === 'ENOTFOUND' ? 'dod' : 'onabar';
}
