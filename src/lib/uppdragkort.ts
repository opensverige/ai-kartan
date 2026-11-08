// Kortet för en profil under Tar uppdrag, ritat i webbläsaren. Samma kort i listan och som
// förhandsvisning när medlemmen fyller i sin profil. Allt sätts som text, aldrig som HTML,
// så att det en medlem skriver aldrig kan bli en länk eller ett skript.
import { ERBJUDER_TEXT, klickUrl, kortDatum, lankEtikett, type Profil } from './uppdrag';

export type Etiketter = { kommuner: Record<string, string>; omraden: Record<string, string> };

function el<K extends keyof HTMLElementTagNameMap>(tagg: K, klass: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tagg);
  if (klass) e.className = klass;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** Ett kort. I förhandsvisningen leder länkarna ingenstans, så att medlemmen inte räknar sina egna klick. */
export function ritaKort(p: Profil, etiketter: Etiketter, forhandsvisning = false): HTMLElement {
  const kort = el(forhandsvisning ? 'div' : 'li', 'profil');

  const topp = el('div', 'profil__topp');
  topp.append(el('span', 'profil__glyf', (p.namn.trim()[0] ?? '·').toUpperCase()));
  const namn = el('div', 'profil__namnblock');
  namn.append(el(forhandsvisning ? 'p' : 'h2', 'profil__namn', p.namn || 'Ditt namn'));
  namn.append(el('p', 'profil__medlem', 'Medlem i OpenSverige'));
  topp.append(namn);
  kort.append(topp);

  kort.append(el('p', 'profil__rubrik', p.rubrik || 'En rad om vad du gör.'));

  const taggar = el('div', 'profil__taggar');
  taggar.append(el('span', 'tagg profil__erbjuder', ERBJUDER_TEXT[p.erbjuder] ?? ERBJUDER_TEXT.uppdrag));
  const ort = p.kommun ? etiketter.kommuner[p.kommun] : undefined;
  if (ort) taggar.append(el('span', 'tagg', ort));
  if (p.distans) taggar.append(el('span', 'tagg', 'Distans'));
  for (const o of p.omraden) {
    const etikett = etiketter.omraden[o];
    if (etikett) taggar.append(el('span', 'tagg', etikett));
  }
  kort.append(taggar);

  if (p.bolag_namn) {
    const bolag = el('p', 'profil__bolag meta');
    bolag.append('Bolag: ');
    if (p.bolag_webbplats && !forhandsvisning) {
      const a = el('a', '', p.bolag_namn);
      a.href = p.bolag_webbplats;
      a.rel = 'nofollow noopener';
      bolag.append(a);
    } else {
      bolag.append(p.bolag_namn);
    }
    kort.append(bolag);
  }

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
  if (p.uppdaterad_at) fot.append(el('span', 'meta', `Uppdaterad ${kortDatum(p.uppdaterad_at)}`));
  kort.append(fot);
  return kort;
}
