// Kortet för en profil under Tar uppdrag, ritat i webbläsaren. Allt medlemmen skriver sätts som
// text, aldrig som HTML, så att det aldrig kan bli en länk eller ett skript.
//
// Kortet finns i två former. Samlarkortet står i listan och i förhandsvisningen: figuren stor,
// namnet och en rad under. Det kompakta står vid en hand på kartan, med figuren liten bredvid
// namnet, så att det inte täcker kartan på en telefon. Områden och vad man erbjuder styr filtren
// i listan och står inte på kortet.
import { figurFor, figurSrc } from './figurer';
import { ikon } from './ikoner';
import { klickUrl, lankEtikett, ortrad, type Profil } from './uppdrag';

export type Etiketter = { kommuner: Record<string, string>; omraden: Record<string, string> };

export type Kortval = {
  /** I förhandsvisningen leder länkarna ingenstans, så att medlemmen inte räknar sina egna klick. */
  forhandsvisning?: boolean;
  /** Rubriknivån för namnet. h3 när kortet ligger under en annan rubrik, som vid en hand på kartan. */
  rubrik?: 'h2' | 'h3';
  /** Samlarkortet i listan och förhandsvisningen, det kompakta vid en hand på kartan. */
  form?: 'samlarkort' | 'kompakt';
};

/** Profilen som kortet behöver. Figuren kan saknas i en profil som sparades innan den fanns. */
export type Kortprofil = Omit<Profil, 'figur'> & { figur?: string | null };

function el<K extends keyof HTMLElementTagNameMap>(tagg: K, klass: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tagg);
  if (klass) e.className = klass;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** Figuren i sin färgade ruta. Bilden säger inget som inte står i namnet bredvid, så alt är tom. */
function figurruta(p: Kortprofil, klass: string): HTMLElement {
  const f = figurFor(p);
  const ruta = el('span', klass);
  ruta.style.setProperty('--figur-farg', f.farg);
  const bild = el('img', `${klass}-bild`);
  bild.src = figurSrc(f, import.meta.env.BASE_URL);
  bild.alt = '';
  bild.width = 240;
  bild.height = 240;
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

function samlarkort(p: Kortprofil, etiketter: Etiketter, forhandsvisning: boolean, rubrik: 'h2' | 'h3'): HTMLElement {
  const kort = el(forhandsvisning ? 'div' : 'li', 'samlarkort');
  const bild = figurruta(p, 'samlarkort__figur');
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
  const bild = figurruta(p, 'profil__figur');
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
  return val.form === 'samlarkort' ? samlarkort(p, etiketter, forhandsvisning, rubrik) : kompakt(p, etiketter, forhandsvisning, rubrik);
}
