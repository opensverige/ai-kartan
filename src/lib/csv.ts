// CSV enligt RFC 4180, för att plocka ut ett urval ur /api/data.csv i webbläsaren.
// Testas i csv.test.mjs.

/** Delar upp CSV-text i rader och fält. Fält inom citattecken får innehålla avgränsare,
 *  radbrytningar och dubblade citattecken. */
export function lasCsv(text: string, avgransare: string = ','): string[][] {
  const rader: string[][] = [];
  let rad: string[] = [];
  let falt = '';
  let citat = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (citat) {
      if (c === '"' && text[i + 1] === '"') {
        falt += '"';
        i++;
      } else if (c === '"') citat = false;
      else falt += c;
    } else if (c === '"') citat = true;
    else if (c === avgransare) {
      rad.push(falt);
      falt = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      rad.push(falt);
      rader.push(rad);
      rad = [];
      falt = '';
    } else falt += c;
  }
  if (falt || rad.length) {
    rad.push(falt);
    rader.push(rad);
  }
  return rader;
}

/** Skriver rader som CSV. Ett fält citeras bara när det innehåller avgränsaren, citattecken eller radbrytning. */
export function skrivCsv(rader: string[][], avgransare: string = ','): string {
  const cell = (v: string): string => (v.includes(avgransare) || /["\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return rader.map((rad) => rad.map(cell).join(avgransare) + '\r\n').join('');
}

/** Rubrikraden och de poster vars id står i `ids`, i den ordningen. Skrivs med semikolon och
 *  inledande BOM, så att filen öppnas rätt i Excel med svenska inställningar. */
export function urvalSomCsv(helCsv: string, ids: string[]): string {
  const [rubriker, ...poster] = lasCsv(helCsv);
  const perId = new Map(poster.map((rad) => [rad[0], rad]));
  const valda = ids.map((id) => perId.get(id)).filter((rad): rad is string[] => rad !== undefined);
  return '﻿' + skrivCsv([rubriker ?? [], ...valda], ';');
}
