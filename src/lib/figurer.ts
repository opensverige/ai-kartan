// Figurerna på korten under Tar uppdrag. Medlemmen väljer en tecknad figur i stället för att
// lägga upp en bild, så ingen bild på någon sparas. Figurerna är Notionists av Zoish, CC0 1.0,
// framtagna med DiceBear och lagda i public/figurer/. Se README där.
//
// Ett id byts aldrig ut och tas aldrig bort, eftersom det kan stå i en sparad profil. Nya figurer
// läggs till sist, och då höjs ANTAL_FIGURER i funktionen uppdrag i opensverige/webbplats också.

export type Figur = {
  id: string;
  /** Rutans färg bakom figuren. Varma pasteller som håller ihop med kartans sand, mossa och rost. */
  farg: string;
};

const SAND = '#f1e3cc';
const SALVIA = '#dbe5d2';
const SYREN = '#e6dcee';
const DIMMA = '#dde3ea';
const SMOR = '#efe5b9';
const LERA = '#f1d6c8';

export const FIGURER: readonly Figur[] = [
  { id: 'f01', farg: SAND },
  { id: 'f02', farg: SALVIA },
  { id: 'f03', farg: SYREN },
  { id: 'f04', farg: DIMMA },
  { id: 'f05', farg: SMOR },
  { id: 'f06', farg: LERA },
  { id: 'f07', farg: SALVIA },
  { id: 'f08', farg: SYREN },
  { id: 'f09', farg: SAND },
  { id: 'f10', farg: DIMMA },
  { id: 'f11', farg: LERA },
  { id: 'f12', farg: SMOR },
  { id: 'f13', farg: SALVIA },
  { id: 'f14', farg: SAND },
  { id: 'f15', farg: DIMMA },
  { id: 'f16', farg: SYREN },
];

const PER_ID = new Map(FIGURER.map((f) => [f.id, f]));

/** Figuren med det id:t, eller undefined. Ett okänt id ger aldrig en egen sökväg till en fil. */
export function figurMedId(id: string | null | undefined): Figur | undefined {
  return id ? PER_ID.get(id) : undefined;
}

/**
 * Profilens figur. Har medlemmen inte valt någon, eller står det ett id som kartan inte känner,
 * väljs en utifrån profilens adress. Den blir densamma varje gång, för alla som tittar.
 */
export function figurFor(p: { figur?: string | null; slug: string }): Figur {
  const vald = figurMedId(p.figur);
  if (vald) return vald;
  let h = 2166136261;
  for (const c of p.slug) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return FIGURER[h % FIGURER.length];
}

/** Sökvägen till figurens bild. `bas` är sajtens bas, import.meta.env.BASE_URL i webbläsaren. */
export function figurSrc(f: Figur, bas = '/'): string {
  return `${bas.endsWith('/') ? bas : `${bas}/`}figurer/${f.id}.svg`;
}
