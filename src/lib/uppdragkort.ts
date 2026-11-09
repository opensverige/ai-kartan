// Kortet för en profil under Tar uppdrag, ritat i webbläsaren. Allt medlemmen skriver sätts som
// text, aldrig som HTML, så att det aldrig kan bli en länk eller ett skript.
//
// Kortet finns i två former. Samlarkortet står i listan och i förhandsvisningen, byggt som ett
// samlarkort: folieram, namnet överst, bilden stor, vad medlemmen erbjuder och en rad om vad den
// gör, och längst ner föreningens märke och kortets nummer. Allt på kortet är medlemmens egna
// uppgifter. Ramen och glansen är desamma på alla kort, så inget kort ser finare ut än ett annat.
// Det kompakta står vid en hand på kartan, med bilden liten bredvid namnet, så att det inte täcker
// kartan på en telefon. En profil från innan bilden fanns visar pixelhanden.
import { ikon } from './ikoner';
import { bildUrl, ERBJUDER_TEXT, klickUrl, kortnummer, lankEtikett, ortrad, type Profil } from './uppdrag';

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

/** Vad medlemmen erbjuder och det första området, som en rad överst på kortets textdel. */
function typrad(p: Kortprofil, etiketter: Etiketter): string {
  const omraden = (p.omraden ?? []).map((id) => etiketter.omraden[id]).filter(Boolean);
  const fler = omraden.length > 1 ? ` +${omraden.length - 1}` : '';
  return [ERBJUDER_TEXT[p.erbjuder] ?? ERBJUDER_TEXT.uppdrag, ...(omraden[0] ? [`${omraden[0]}${fler}`] : [])].join(' · ');
}

function samlarkort(p: Kortprofil, etiketter: Etiketter, forhandsvisning: boolean, rubrik: 'h2' | 'h3', bildSrc?: string): HTMLElement {
  const kort = el(forhandsvisning ? 'div' : 'li', 'samlarkort');
  const yta = el('div', 'samlarkort__yta');
  yta.append(el(forhandsvisning ? 'p' : rubrik, 'samlarkort__namn', p.namn || 'Ditt namn'));

  const bild = bildruta(p, 'samlarkort__bild', bildSrc);
  // Glansen och stämpeln är utsmyckning. Att personen är medlem står redan på sidan.
  const glans = el('span', 'samlarkort__glans');
  glans.setAttribute('aria-hidden', 'true');
  const stampel = el('span', 'samlarkort__stampel', 'Medlem');
  stampel.setAttribute('aria-hidden', 'true');
  bild.append(glans, stampel);
  const ort = ortrad(p, etiketter.kommuner);
  if (ort) bild.append(el('span', 'samlarkort__ort', ort));
  yta.append(bild);

  yta.append(el('p', 'samlarkort__typ', typrad(p, etiketter)));
  yta.append(el('p', 'samlarkort__rubrik', p.rubrik || 'En rad om vad du gör.'));
  const fot = el('p', 'samlarkort__fot');
  fot.append(lank(p, 'samlarkort__lank', forhandsvisning));
  const b = bolag(p, 'samlarkort__bolag', forhandsvisning);
  if (b) fot.append(b);
  yta.append(fot);

  // Längst ner, som på ett samlarkort: märket och kortets nummer. Numret är de slumpade tecknen i
  // adressen, så ett nytt kort i förhandsvisningen har inget än.
  const serie = el('p', 'samlarkort__serie');
  serie.setAttribute('aria-hidden', 'true');
  const marke = el('img', 'samlarkort__marke');
  marke.src = pixelhandSrc();
  marke.alt = '';
  marke.decoding = 'async';
  marke.loading = 'lazy';
  serie.append(marke, el('span', '', 'OpenSverige'));
  const nr = kortnummer(p.slug ?? '');
  if (nr) serie.append(el('span', 'samlarkort__nr', `Nº ${nr}`));
  yta.append(serie);

  kort.append(yta);
  return kort;
}

/**
 * Kortet lutar efter pekaren och folien glänser, som när man vinklar ett riktigt kort. Bara med
 * mus eller styrplatta, och inte för den som bett om mindre rörelse. Lyssnaren sitter på listan,
 * så den gäller också kort som ritas om senare.
 */
export function folie(rot: HTMLElement): void {
  if (!matchMedia('(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)').matches) return;
  const ytor = '.samlarkort__yta, .kortbak__yta';
  let ram = 0;
  rot.addEventListener('pointermove', (e) => {
    const yta = (e.target as Element | null)?.closest<HTMLElement>(ytor);
    if (!yta) return;
    cancelAnimationFrame(ram);
    ram = requestAnimationFrame(() => {
      const r = yta.getBoundingClientRect();
      const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
      yta.style.setProperty('--rx', `${((0.5 - y) * 9).toFixed(2)}deg`);
      yta.style.setProperty('--ry', `${((x - 0.5) * 11).toFixed(2)}deg`);
      yta.style.setProperty('--px', `${(x * 100).toFixed(1)}%`);
      yta.style.setProperty('--py', `${(y * 100).toFixed(1)}%`);
      yta.style.setProperty('--folievinkel', `${Math.round(60 + x * 120)}deg`);
    });
  });
  rot.addEventListener('pointerout', (e) => {
    const yta = (e.target as Element | null)?.closest<HTMLElement>(ytor);
    if (!yta || (e.relatedTarget instanceof Node && yta.contains(e.relatedTarget))) return;
    cancelAnimationFrame(ram);
    for (const v of ['--rx', '--ry', '--px', '--py', '--folievinkel']) yta.style.removeProperty(v);
  });
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
