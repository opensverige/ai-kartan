// Organisationens tända hus som en liten bild på organisationens sida: ett utsnitt ur pixelstaden
// med huset i mitten och dess form som en ljus kant. Ett tryck tar besökaren till huset på kartan.
// Bara organisationer med exakt adress har ett hus. De som står i vattnet får ingen bild.

import type { Kartfil } from './geometri.ts';

/** Bildrutorna i en kartbild är så här många punkter i fyrkant. */
const RUTA = 512;
/** Huset tar ungefär så stor del av fönstrets bredd: staden runt syns, och huset går att känna igen. */
const HUSANDEL = 0.42;

export interface Husutsnitt {
  /** Stadens namn, som "Stockholm". */
  stad: string;
  bredd: number;
  hojd: number;
  /** Bildrutorna, med var deras övre vänstra hörn hamnar i fönstret. Kantrutor kan vara mindre än 512. */
  rutor: { src: string; x: number; y: number }[];
  /** Husets form, i fönstrets punkter. */
  hus: { src: string; x: number; y: number; w: number; h: number };
}

/**
 * Utsnittet runt organisationens hus, eller null när den inte har något tänt hus. Nivån väljs så
 * att huset tar ungefär HUSANDEL av fönstrets bredd. Fönstret hålls inom stadens bild.
 */
export function husutsnitt(fil: Kartfil, id: string, bas: string, bredd = 480, hojd = 260): Husutsnitt | null {
  const rot = bas.replace(/\/+$/, '') + '/';
  for (const stad of fil.cities) {
    const nyckel = stad.addresses?.[id];
    const hus = nyckel ? stad.houses?.[nyckel] : undefined;
    if (!hus) continue;
    const blad = stad.map;
    const storst = Math.ceil(Math.log2(Math.max(blad.width, blad.height)));
    const ner = Math.min(storst, Math.max(0, Math.round(Math.log2(Math.max(hus.w, hus.h) / (HUSANDEL * bredd)))));
    const skala = 2 ** ner;
    const bildB = Math.ceil(blad.width / skala);
    const bildH = Math.ceil(blad.height / skala);
    const ram = (v: number, hogst: number): number => Math.round(Math.min(Math.max(v, 0), Math.max(0, hogst)));
    const vanster = ram((hus.x + hus.w / 2) / skala - bredd / 2, bildB - bredd);
    const topp = ram((hus.y + hus.h / 2) / skala - hojd / 2, bildH - hojd);
    const mapp = `${rot}${blad.dzi.replace(/\.dzi$/, '_files')}/${storst - ner}`;
    const rutor: Husutsnitt['rutor'] = [];
    for (let ty = Math.floor(topp / RUTA); ty <= Math.floor((topp + hojd - 1) / RUTA); ty++) {
      for (let tx = Math.floor(vanster / RUTA); tx <= Math.floor((vanster + bredd - 1) / RUTA); tx++) {
        rutor.push({ src: `${mapp}/${tx}_${ty}.webp`, x: tx * RUTA - vanster, y: ty * RUTA - topp });
      }
    }
    return {
      stad: stad.label,
      bredd,
      hojd,
      rutor,
      hus: { src: rot + hus.picture, x: hus.x / skala - vanster, y: hus.y / skala - topp, w: hus.w / skala, h: hus.h / skala },
    };
  }
  return null;
}
