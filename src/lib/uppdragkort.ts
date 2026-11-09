// Kortet för en profil under Tar uppdrag, ritat i webbläsaren. Allt medlemmen skriver sätts som
// text, aldrig som HTML, så att det aldrig kan bli en länk eller ett skript.
//
// Kortet finns i två former. Samlarkortet står i listan och i förhandsvisningen: bilden stor,
// namnet och en rad under. Det kompakta står vid en hand på kartan, med bilden liten bredvid
// namnet, så att det inte täcker kartan på en telefon. Områden och vad man erbjuder styr filtren
// i listan och står inte på kortet. En profil från innan bilden fanns visar pixelhanden.
import { ikon } from './ikoner';
import { bildUrl, klickUrl, lankEtikett, ortrad, type Profil } from './uppdrag';

export type Etiketter = { kommuner: Record<string, string>; omraden: Record<string, string> };

export type Kortval = {
  /** I förhandsvisningen leder länkarna ingenstans, så att medlemmen inte räknar sina egna klick. */
  forhandsvisning?: boolean;
  /** Rubriknivån för namnet. h3 när kortet ligger under en annan rubrik, som vid en hand på kartan. */
  rubrik?: 'h2' | 'h3';
  /** Samlarkortet i listan och förhandsvisningen, det kompakta vid en hand på kartan. */
  form?: 'samlarkort' | 'kompakt';
  /** En bild som ännu inte är sparad, i förhandsvisningen. Annars hämtas profilens egen. */
  bildSrc?: string;
};

/** Profilen som kortet behöver. */
export type Kortprofil = Omit<Profil, 'bild'> & { bild?: string | null };

/** Föreningens pixelhand, när en profil saknar bild. */
export function pixelhandSrc(): string {
  const bas = import.meta.env.BASE_URL;
  return `${bas.endsWith('/') ? bas : `${bas}/`}pixelhand.webp`;
}

function el<K extends keyof HTMLElementTagNameMap>(tagg: K, klass: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tagg);
  if (klass) e.className = klass;
  if (text !== undefined) e.textContent = text;
  return e;
}

/**
 * Bilden i sin ruta, eller pixelhanden när profilen saknar bild. Namnet står bredvid, så bilden
 * har tom alt-text.
 */
function bildruta(p: Kortprofil, klass: string, bildSrc?: string): HTMLElement {
  const src = bildSrc ?? bildUrl({ slug: p.slug, bild: p.bild ?? null });
  const ruta = el('span', src ? klass : `${klass} ${klass}--utan`);
  const bild = el('img', src ? `${klass}-foto` : `${klass}-hand`);
  bild.src = src ?? pixelhandSrc();
  bild.alt = '';
  bild.decoding = 'async';
  bild.loading = 'lazy';
  ruta.append(bild);
  return ruta;
}

function lank(p: Kortprofil, klass: string, forhandsvisning: boolean): HTMLAnchorElement {
  const a = el('a', klass, `${lankEtikett(p.lank)} →`);
  if (forhandsvisning) {
    a.setAttribute('aria-disabled', 'true');
    a.tabIndex = -1;
  } else {
    a.href = klickUrl(p.slug);
    a.rel = 'nofollow noopener';
  }
  return a;
}

function bolag(p: Kortprofil, klass: string, forhandsvisning: boolean): HTMLElement | null {
  if (!p.bolag_namn) return null;
  if (p.bolag_webbplats && !forhandsvisning) {
    const a = el('a', klass, p.bolag_namn);
    a.href = p.bolag_webbplats;
    a.rel = 'nofollow noopener';
    return a;
  }
  return el('span', klass, p.bolag_namn);
}

function samlarkort(p: Kortprofil, etiketter: Etiketter, forhandsvisning: boolean, rubrik: 'h2' | 'h3', bildSrc?: string): HTMLElement {
  const kort = el(forhandsvisning ? 'div' : 'li', 'samlarkort');
  const bild = bildruta(p, 'samlarkort__bild', bildSrc);
  const ort = ortrad(p, etiketter.kommuner);
  if (ort) bild.append(el('span', 'samlarkort__ort', ort));
  kort.append(bild);

  const text = el('div', 'samlarkort__text');
  text.append(el(forhandsvisning ? 'p' : rubrik, 'samlarkort__namn', p.namn || 'Ditt namn'));
  text.append(el('p', 'samlarkort__rubrik', p.rubrik || 'En rad om vad du gör.'));
  const fot = el('p', 'samlarkort__fot');
  fot.append(lank(p, 'samlarkort__lank', forhandsvisning));
  const b = bolag(p, 'samlarkort__bolag', forhandsvisning);
  if (b) fot.append(b);
  text.append(fot);
  kort.append(text);
  return kort;
}

function kompakt(p: Kortprofil, etiketter: Etiketter, forhandsvisning: boolean, rubrik: 'h2' | 'h3'): HTMLElement {
  const kort = el(forhandsvisning ? 'div' : 'li', 'profil');
  const topp = el('div', 'profil__topp');
  const bild = bildruta(p, 'profil__bild');
  // Handen säger att personen är medlem och tar uppdrag. Ikonen är fast markup, aldrig medlemmens text.
  const hand = el('span', 'profil__hand');
  hand.innerHTML = ikon('hand', 11);
  bild.append(hand);
  topp.append(bild);

  const namnblock = el('div', 'profil__namnblock');
  namnblock.append(el(forhandsvisning ? 'p' : rubrik, 'profil__namn', p.namn || 'Ditt namn'));
  const ort = ortrad(p, etiketter.kommuner);
  if (ort) namnblock.append(el('p', 'profil__ort', ort));
  topp.append(namnblock);
  kort.append(topp);

  kort.append(el('p', 'profil__rubrik', p.rubrik || 'En rad om vad du gör.'));
  const fot = el('div', 'profil__fot');
  fot.append(lank(p, 'knapp knapp--liten profil__knapp', forhandsvisning));
  const b = bolag(p, 'profil__bolag', forhandsvisning);
  if (b) fot.append(b);
  kort.append(fot);
  return kort;
}

export function ritaKort(p: Kortprofil, etiketter: Etiketter, val: Kortval = {}): HTMLElement {
  const forhandsvisning = val.forhandsvisning ?? false;
  const rubrik = val.rubrik ?? 'h2';
  return val.form === 'samlarkort' ? samlarkort(p, etiketter, forhandsvisning, rubrik, val.bildSrc) : kompakt(p, etiketter, forhandsvisning, rubrik);
}
