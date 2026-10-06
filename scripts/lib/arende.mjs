// Läser ifyllda ärendeformulär från GitHub. Delas av skripten som tar emot nya organisationer.

/** Delar upp GitHubs formulärutdata "### Etikett\n\nvärde" i ett objekt. */
export function parsa(text) {
  const ut = {};
  const delar = text.split(/^### /m).slice(1);
  for (const del of delar) {
    const [rubrik, ...rest] = del.split('\n');
    const varde = rest.join('\n').trim();
    ut[rubrik.trim()] = varde === '_No response_' ? '' : varde;
  }
  return ut;
}

/** De ikryssade rutornas text, fram till ett eventuellt tankstreck. */
export function ikryssade(text) {
  return (text || '')
    .split('\n')
    .filter((r) => /^- \[[xX]\]/.test(r))
    .map((r) => r.replace(/^- \[[xX]\]\s*/, '').split(/\s+[–-]\s+/)[0].trim());
}

export function normaliseraUrl(u) {
  u = (u || '').trim();
  if (!u) return '';
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  return u.replace(/\/+$/, '');
}
