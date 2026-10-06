// Vakt för ändringshistoriken. history/changelog.json byggs ur git-historiken, så en
// avkortad historik (grund klon, nystartat repo) ger färre rader än filen redan har.

/** Sant om git ger färre rader än den sparade filen redan innehåller. */
export function historikenKrymper(antalRader, gammalFiltext) {
  if (!gammalFiltext.trim()) return false;
  let gammaltAntal = 0;
  try {
    gammaltAntal = JSON.parse(gammalFiltext).antal ?? 0;
  } catch {
    return false;
  }
  return antalRader < gammaltAntal;
}
