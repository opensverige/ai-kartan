// Kortet för en profil under Tar uppdrag, ritat i webbläsaren. Allt medlemmen skriver sätts som
// text, aldrig som HTML, så att det aldrig kan bli en länk eller ett skript.
//
// Kortet finns i två former. Raden står i listan och i förhandsvisningen: en liten bild, namnet
// och orten, vad medlemmen gör och kan, och länken ut. Allt som behövs för att avgöra om personen
// passar står på raden, och hela raden är länken, så att vägen dit är ett klick. Det kompakta
// kortet står vid en hand på kartan, så att det inte täcker kartan på en telefon. En profil utan
// bild visar föreningens pixelhand.
import { ikon, logga } from './ikoner';
import { bildUrl, klickUrl, lankEtikett, lanktyp, ortrad, type Profil, type Uppslag } from './uppdrag';

export type Etiketter = Uppslag;

export type Kortval = {
  /** I förhandsvisningen leder länkarna ingenstans, så att medlemmen inte räknar sina egna klick. */
  forhandsvisning?: boolean;
  /** Rubriknivån för namnet. h3 när kortet ligger under en annan rubrik, som vid en hand på kartan. */
  rubrik?: 'h2' | 'h3';
  /** Raden i listan och förhandsvisningen, det kompakta vid en hand på kartan. */
  form?: 'rad' | 'kompakt';
  /** En bild som ännu inte är sparad, i förhandsvisningen. Annars hämtas profilens egen. */
  bildSrc?: string;
};

/** Profilen som kortet behöver. */
export type Kortprofil = Omit<Profil, 'bild' | 'kunskaper'> & { bild?: string | null; kunskaper?: string[] };

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

/** Tjänstens märke framför länken, så att den känns igen utan att läsas. Fast markup, aldrig medlemmens text. */
function lankmarke(href: string): string {
  const typ = lanktyp(href)?.typ;
  return typ === 'github' || typ === 'x' || typ === 'linkedin' ? logga(typ, 15) : ikon('lank', 15);
}

function rad(p: Kortprofil, etiketter: Etiketter, forhandsvisning: boolean, rubrik: 'h2' | 'h3', bildSrc?: string): HTMLElement {
  const kort = el(forhandsvisning ? 'div' : 'li', 'medlemsrad');
  kort.append(bildruta(p, 'medlemsrad__bild', bildSrc));

  const vem = el('div', 'medlemsrad__vem');
  vem.append(el(forhandsvisning ? 'p' : rubrik, 'medlemsrad__namn', p.namn || 'Ditt namn'));
  const ort = ortrad(p, etiketter.kommuner);
  if (ort) vem.append(el('p', 'medlemsrad__ort', ort));
  kort.append(vem);

  const vad = el('div', 'medlemsrad__vad');
  vad.append(el('p', 'medlemsrad__rubrik', p.rubrik || 'En rad om vad du gör.'));
  // Kunskaperna är medlemmens egna ord och står som brickor. Områdena är kartans, och står som text efter.
  const kunskaper = p.kunskaper ?? [];
  // Ett område som medlemmen också har skrivit som kunskap står bara en gång.
  const skrivna = new Set(kunskaper.map((k) => k.toLowerCase()));
  const omraden = (p.omraden ?? []).map((id) => etiketter.omraden[id]).filter((o) => o && !skrivna.has(o.toLowerCase()));
  if (kunskaper.length || omraden.length) {
    const ord = el('ul', 'medlemsrad__ord');
    ord.setAttribute('aria-label', 'Kunskaper och områden');
    for (const k of kunskaper) ord.append(el('li', 'medlemsrad__kunskap', k));
    for (const o of omraden) ord.append(el('li', 'medlemsrad__omrade', o));
    vad.append(ord);
  }
  kort.append(vad);

  const ut = el('div', 'medlemsrad__ut');
  const a = lank(p, 'medlemsrad__lank', forhandsvisning);
  const etikett = lankEtikett(p.lank);
  // Märket, namnet och pilen står var för sig, så att ett långt värdnamn kan kortas utan att pilen försvinner.
  const marke = el('span', 'medlemsrad__marke');
  marke.innerHTML = lankmarke(p.lank);
  a.replaceChildren(marke, el('span', 'medlemsrad__lanktext', etikett), el('span', 'medlemsrad__pil', '→'));
  // Flera rader har samma länktext. Namnet efter den skiljer dem åt för den som hör länkarna uppräknade.
  if (p.namn) a.setAttribute('aria-label', `${etikett}, ${p.namn}`);
  ut.append(a);
  const b = bolag(p, 'medlemsrad__bolag', forhandsvisning);
  if (b) ut.append(b);
  kort.append(ut);
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
  return val.form === 'rad' ? rad(p, etiketter, forhandsvisning, rubrik, val.bildSrc) : kompakt(p, etiketter, forhandsvisning, rubrik);
}
