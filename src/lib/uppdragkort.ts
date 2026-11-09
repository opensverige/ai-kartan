// Kortet för en profil under Tar uppdrag, ritat i webbläsaren. Samma kort i listan, som
// förhandsvisning när medlemmen fyller i sin profil och vid en hand på kartan. Allt medlemmen
// skriver sätts som text, aldrig som HTML, så att det aldrig kan bli en länk eller ett skript.
//
// Kortet är smalt med flit: namn, ort, en rad och en knapp. Områden och vad man erbjuder styr
// filtren i listan och står inte på kortet.
import { ikon } from './ikoner';
import { initial, klickUrl, lankEtikett, ortrad, type Profil } from './uppdrag';

export type Etiketter = { kommuner: Record<string, string>; omraden: Record<string, string> };

export type Kortval = {
  /** I förhandsvisningen leder länkarna ingenstans, så att medlemmen inte räknar sina egna klick. */
  forhandsvisning?: boolean;
  /** Rubriknivån för namnet. h3 när kortet ligger under en annan rubrik, som vid en hand på kartan. */
  rubrik?: 'h2' | 'h3';
};

function el<K extends keyof HTMLElementTagNameMap>(tagg: K, klass: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tagg);
  if (klass) e.className = klass;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function ritaKort(p: Profil, etiketter: Etiketter, val: Kortval = {}): HTMLElement {
  const forhandsvisning = val.forhandsvisning ?? false;
  const kort = el(forhandsvisning ? 'div' : 'li', 'profil');

  const topp = el('div', 'profil__topp');
  const bild = el('span', 'profil__bild');
  bild.append(el('span', 'profil__glyf', initial(p.namn)));
  // Handen säger att personen är medlem och tar uppdrag. Ikonen är fast markup, aldrig medlemmens text.
  const hand = el('span', 'profil__hand');
  hand.innerHTML = ikon('hand', 11);
  bild.append(hand);
  topp.append(bild);

  const namnblock = el('div', 'profil__namnblock');
  namnblock.append(el(forhandsvisning ? 'p' : (val.rubrik ?? 'h2'), 'profil__namn', p.namn || 'Ditt namn'));
  const ort = ortrad(p, etiketter.kommuner);
  if (ort) namnblock.append(el('p', 'profil__ort', ort));
  topp.append(namnblock);
  kort.append(topp);

  kort.append(el('p', 'profil__rubrik', p.rubrik || 'En rad om vad du gör.'));

  const fot = el('div', 'profil__fot');
  const knapp = el('a', 'knapp knapp--liten profil__knapp', `${lankEtikett(p.lank)} →`);
  if (forhandsvisning) {
    knapp.setAttribute('aria-disabled', 'true');
    knapp.tabIndex = -1;
  } else {
    knapp.href = klickUrl(p.slug);
    knapp.rel = 'nofollow noopener';
  }
  fot.append(knapp);
  if (p.bolag_namn) {
    if (p.bolag_webbplats && !forhandsvisning) {
      const a = el('a', 'profil__bolag', p.bolag_namn);
      a.href = p.bolag_webbplats;
      a.rel = 'nofollow noopener';
      fot.append(a);
    } else {
      fot.append(el('span', 'profil__bolag', p.bolag_namn));
    }
  }
  kort.append(fot);
  return kort;
}
