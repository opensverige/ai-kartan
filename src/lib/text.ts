// Meningar som sätts ihop av ett tal och ett ord. Samlade här så att "1 kommuner" inte kan uppstå
// på en sida och rättas på en annan.

/** Talet med rätt böjt ord: "1 kommun", "3 kommuner". */
export function antal(n: number, en: string, flera: string): string {
  return `${n} ${n === 1 ? en : flera}`;
}

/** En uppräkning i löpande text: "a, b och c". */
export function uppraknat(delar: string[]): string {
  if (delar.length < 2) return delar.join('');
  return `${delar.slice(0, -1).join(', ')} och ${delar.at(-1)}`;
}

/**
 * Hur många organisationer det finns av varje typ, som löpande text. Typens etikett används i
 * singular när det bara finns en, annars dess pluralform.
 */
export function typrad(perTyp: [string, number][], etikett: (id: string) => { label: string; plural?: string } | undefined): string {
  return uppraknat(
    perTyp.map(([id, n]) => {
      const e = etikett(id);
      return antal(n, (e?.label ?? id).toLowerCase(), (e?.plural ?? e?.label ?? id).toLowerCase());
    }),
  );
}

const TALORD = ['noll', 'en', 'två', 'tre', 'fyra', 'fem', 'sex', 'sju', 'åtta', 'nio', 'tio', 'elva', 'tolv'];

/** Tal upp till tolv skrivs med bokstäver i löpande text. */
export function talord(n: number): string {
  return TALORD[n] ?? String(n);
}
