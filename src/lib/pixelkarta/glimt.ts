// Glimten på startsidan: ett litet fönster över havet som sakta glider över en pixelstad i taget,
// med en knapp in till byggsidan. Ett klick på bilden flyger kartan in i staden. Glimten syns bara
// på startskärmen i en bred kartyta (pixelkarta.css), och bara medan pixelkartan är på och kartan
// visar hela landet.

import { skapaProjektion, type Kartblad } from './geometri.ts';

/** Bildrutorna i en kartbild är så här många punkter i fyrkant. */
const RUTA = 512;
/** Så många nivåer under full storlek hämtas glimtens rutor: detaljer syns, och fyra rutor räcker. */
const NIVAER_NER = 2;
/** Varje stad visas så här länge innan nästa tar över, i millisekunder. */
const BYT_EFTER = 9000;

/**
 * Glimtens fyra bildrutor ur en stads kartbild: två gånger två runt bildens mitt, uppifrån vänster.
 * Tomt när bilden är för liten för att ge fyra rutor på den nivån.
 */
export function glimtRutor(blad: Kartblad, bas: string, meterPerBildpunkt = 0.25): string[] {
  const storst = Math.ceil(Math.log2(Math.max(blad.width, blad.height)));
  const niva = storst - NIVAER_NER;
  const skala = 2 ** NIVAER_NER;
  const kolumner = Math.ceil(Math.ceil(blad.width / skala) / RUTA);
  const rader = Math.ceil(Math.ceil(blad.height / skala) / RUTA);
  if (niva < 0 || kolumner < 2 || rader < 2) return [];
  const mitt = skapaProjektion(blad, meterPerBildpunkt).tillBild(blad.origin.lat, blad.origin.lon);
  const ram = (v: number, hogst: number): number => Math.min(Math.max(v, 0), hogst);
  const x0 = ram(Math.round(mitt.x / skala / RUTA) - 1, kolumner - 2);
  const y0 = ram(Math.round(mitt.y / skala / RUTA) - 1, rader - 2);
  const mapp = `${bas}${blad.dzi.replace(/\.dzi$/, '_files')}/${niva}`;
  const ut: string[] = [];
  for (const y of [y0, y0 + 1]) for (const x of [x0, x0 + 1]) ut.push(`${mapp}/${x}_${y}.webp`);
  return ut;
}

export interface GlimtStad {
  namn: string;
  rutor: string[];
  /** Flyger kartan in i staden. */
  flyg: () => void;
}

export interface Glimt {
  /** Visar eller döljer glimten. Dold står den still och hämtar inga bilder. */
  visa(pa: boolean): void;
}

/** Bygger glimten i `forelder`. Den börjar i en slumpad stad. */
export function skapaGlimt(forelder: HTMLElement, stader: readonly GlimtStad[]): Glimt | null {
  if (!stader.length) return null;
  const rot = document.createElement('div');
  rot.className = 'pixelglimt';
  rot.hidden = true;

  const fonster = document.createElement('button');
  fonster.type = 'button';
  fonster.className = 'pixelglimt__fonster';
  const lager = stader.map(() => {
    const l = document.createElement('div');
    l.className = 'pixelglimt__stad';
    fonster.append(l);
    return l;
  });

  const under = document.createElement('div');
  under.className = 'pixelglimt__under';
  const ort = document.createElement('span');
  ort.className = 'pixelglimt__ort';
  const ortnamn = document.createElement('span');
  const prick = document.createElement('i');
  prick.setAttribute('aria-hidden', 'true');
  const ortrad = document.createElement('span');
  ortrad.append(ortnamn, ', ritad i pixlar');
  ort.append(prick, ortrad);
  const knapp = document.createElement('a');
  knapp.className = 'pixelglimt__knapp';
  knapp.href = '/pixelbygget';
  knapp.textContent = 'Rita en egen ruta ';
  const pil = document.createElement('span');
  pil.setAttribute('aria-hidden', 'true');
  pil.textContent = '→';
  knapp.append(pil);
  under.append(ort, knapp);
  rot.append(fonster, under);
  forelder.append(rot);

  // Bilderna hämtas först när staden ska visas, och nästa stad strax innan den tar över.
  const hamta = (n: number): void => {
    const l = lager[n];
    if (l.childElementCount) return;
    for (const url of stader[n].rutor) {
      const bild = document.createElement('img');
      bild.alt = '';
      bild.decoding = 'async';
      bild.src = url;
      l.append(bild);
    }
  };

  let nu = Math.floor(Math.random() * stader.length);
  let synlig = false;
  let klocka = 0;
  const visaStad = (): void => {
    hamta(nu);
    lager.forEach((l, n) => l.classList.toggle('pixelglimt__stad--syns', n === nu));
    ortnamn.textContent = stader[nu].namn;
    fonster.setAttribute('aria-label', `Flyg in i ${stader[nu].namn} på kartan`);
  };
  const nasta = (): void => {
    // Den som pekar på glimten tittar: staden står kvar.
    if (fonster.matches(':hover')) return;
    nu = (nu + 1) % stader.length;
    visaStad();
    hamta((nu + 1) % stader.length);
  };
  fonster.addEventListener('click', () => stader[nu].flyg());

  return {
    visa(pa: boolean): void {
      if (pa === synlig) return;
      synlig = pa;
      rot.hidden = !pa;
      window.clearInterval(klocka);
      if (!pa) return;
      visaStad();
      if (stader.length > 1 && !matchMedia('(prefers-reduced-motion: reduce)').matches) klocka = window.setInterval(nasta, BYT_EFTER);
    },
  };
}
