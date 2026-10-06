// Mekaniska kontroller av belägg (kriterium 2). Vad en länk faktiskt visar avgör en
// människa. Det här fångar bara det som går att se i datan: fel sorts belägg för
// organisationstypen, och poster som inte har något belägg som är deras eget.

/** Postens belägglänkar, utan avslutande snedstreck så att samma sida räknas som samma länk. */
function lankar(data) {
  const belagg = Array.isArray(data?.evidence) ? data.evidence : [];
  return new Set(belagg.map((b) => String(b?.url ?? '').trim().replace(/\/+$/, '')).filter(Boolean));
}

/**
 * Anmärkning om inget av postens belägg är av en sort som räknas för organisationstypen
 * (listan `belagg` i data/taxonomi/typer.json), annars null.
 */
export function provaBelaggstyp(data, tax) {
  const typ = tax.typer.find((t) => t.id === data?.type?.value);
  const raknas = typ?.belagg ?? [];
  const belagg = Array.isArray(data?.evidence) ? data.evidence : [];
  if (!raknas.length || !belagg.length) return null;
  if (belagg.some((b) => raknas.includes(b?.kind))) return null;
  const etikett = (id) => tax.belaggstyper.find((b) => b.id === id)?.label ?? id;
  return `evidence: inget belägg av en sort som räknas för ${typ.label} (${raknas.map(etikett).join(', ')}). Se kriterium 2.`;
}

/**
 * Poster utan eget belägg: varje länk används också av en annan post.
 * Ger en Map från postens id till de andra posternas id.
 */
export function utanEgetBelagg(poster) {
  const perLank = new Map();
  for (const p of poster) {
    for (const l of lankar(p)) perLank.set(l, [...(perLank.get(l) ?? []), p.id]);
  }
  const utan = new Map();
  for (const p of poster) {
    const egna = [...lankar(p)];
    if (!egna.length) continue;
    const delar = egna.map((l) => perLank.get(l).filter((id) => id !== p.id));
    if (delar.some((andra) => andra.length === 0)) continue;
    utan.set(p.id, [...new Set(delar.flat())].sort());
  }
  return utan;
}
