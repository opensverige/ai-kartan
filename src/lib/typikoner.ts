// Ikoner per organisationstyp. En ikon är en fil i public/ikoner/typ/<typens id>.png.
// Det räcker att lägga dit filen: sajten letar själv, så ingen lista behöver hållas i takt.

/**
 * Typer som har en ikon, med adressen till filen.
 * `finns` får en sökväg under public/ och svarar om filen finns.
 */
export function hittaTypikoner(
  typIds: string[],
  finns: (fil: string) => boolean,
  adress: (stig: string) => string = (stig) => stig,
): Record<string, string> {
  const ikoner: Record<string, string> = {};
  for (const id of typIds) {
    const fil = `ikoner/typ/${id}.png`;
    if (finns(fil)) ikoner[id] = adress(`/${fil}`);
  }
  return ikoner;
}
