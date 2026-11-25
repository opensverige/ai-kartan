// Pixelbygget i webbläsaren: pixelstaden med rutnätet över, och bladet för en vald ruta.
//
// Staden visas nedtonad. En ruta som en frivillig har byggt och som är godkänd lyser i färg med
// byggarens namn. En ledig ruta går att klicka på: då visas vad som krävs, en rad att ge till
// sin AI-agent och länken till repot. Rutnätet läses från rut-tjänsten var minut.
//
// Allt som kommer från tjänsten är data från andra. Det läses i rutnat.ts och skrivs in i
// sidan som text (textContent), aldrig som HTML.

import type OpenSeadragon from 'openseadragon';
import { RUTA, REPO, agentrad, ankare, kalla, kartbild, krav, lage, lasAnkare, lasBlad, lasRutor, lasUtgava, rakna, rutaVidPunkt, topplista } from './rutnat';
import type { Blad, Ruta } from './rutnat';

interface Val {
  el: HTMLElement;
  /** Rut-tjänstens adress. */
  tjanst: string;
  /** Bildtjänstens adress med version, till exempel https://…/v1. Utan den visas bara rutnätet. */
  bilder?: string;
}

const PAPPER = '242, 238, 229';
const MOSS = 'hsl(120 24% 23%)';
const ROST = 'hsl(25 60% 40%)';
const BARNSTEN = 'hsl(38 74% 33%)';
const BLACK = 'hsl(45 17% 5%)';
const LEDIG = 'hsl(42 45% 98% / 0.78)';
// En tom bildruta i papprets färg, för visning utan bildtjänst.
const TOM_RUTA = 'data:image/gif;base64,R0lGODlhAQABAIAAAPLu5QAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==';

function el<K extends keyof HTMLElementTagNameMap>(tagg: K, klass?: string, text?: string): HTMLElementTagNameMap[K] {
  const nod = document.createElement(tagg);
  if (klass) nod.className = klass;
  if (text !== undefined) nod.textContent = text;
  return nod;
}

async function hamta(adress: string): Promise<unknown> {
  const svar = await fetch(adress, { headers: { Accept: 'application/json' } });
  if (!svar.ok) throw new Error(String(svar.status));
  return svar.json();
}

export async function startaBygge(val: Val): Promise<void> {
  const tjanst = val.tjanst.replace(/\/+$/, '');
  const bilder = val.bilder ? val.bilder.replace(/\/+$/, '') + '/' : null;
  const q = <T extends HTMLElement>(namn: string): T => val.el.querySelector<T>(`[data-${namn}]`)!;
  const kartEl = q<HTMLDivElement>('karta');
  const duk = q<HTMLCanvasElement>('rutnat');
  const besked = q<HTMLParagraphElement>('besked');
  const stader = q<HTMLDivElement>('stader');
  const rakning = q<HTMLDivElement>('rakning');
  const lista = q<HTMLDivElement>('topplista');
  const blad = q<HTMLElement>('ruta');
  const nastaKnapp = q<HTMLButtonElement>('nasta');

  let bladen: Blad[] = [];
  let aktivt: Blad | null = null;
  let rutor: Ruta[] = [];
  let perPlats = new Map<string, Ruta>();
  let vald: { kol: number; rad: number } | null = null;
  let visare: OpenSeadragon.Viewer | null = null;
  let OSD: typeof OpenSeadragon | null = null;
  let monster: CanvasPattern | null = null;

  const sag = (text: string): void => {
    besked.textContent = text;
    besked.hidden = text === '';
  };

  try {
    const svar = (await hamta(`${tjanst}/v1/sheets`)) as { sheets?: unknown[] };
    bladen = (Array.isArray(svar?.sheets) ? svar.sheets : []).map(lasBlad).filter((b): b is Blad => b !== null && b.oppet);
  } catch {
    sag('Rutnätet svarar inte just nu. Försök igen om en stund.');
    return;
  }
  // Vilken utgåva av varje kartbild som gäller: rutor som redan har lagts in ska synas här.
  // Svarar bildtjänsten inte visas basen, som förut.
  let utgavor: unknown = null;
  if (bilder) utgavor = await hamta(`${bilder}karta-utgava.json`).catch(() => null);
  if (bladen.length === 0) {
    sag('Ingen stad är öppen för bygge just nu.');
    return;
  }

  // ---- rutnätet över kartbilden

  function rita(): void {
    const v = visare;
    const b = aktivt;
    if (!v || !b || !OSD || v.world.getItemCount() === 0) return;
    const skala = window.devicePixelRatio || 1;
    const bredd = kartEl.clientWidth;
    const hojd = kartEl.clientHeight;
    if (duk.width !== Math.round(bredd * skala) || duk.height !== Math.round(hojd * skala)) {
      duk.width = Math.round(bredd * skala);
      duk.height = Math.round(hojd * skala);
    }
    const g = duk.getContext('2d');
    if (!g) return;
    g.setTransform(skala, 0, 0, skala, 0, 0);
    g.clearRect(0, 0, bredd, hojd);
    const horn = v.viewport.imageToViewerElementCoordinates(new OSD.Point(0, 0));
    const nasta = v.viewport.imageToViewerElementCoordinates(new OSD.Point(RUTA, RUTA));
    const s = nasta.x - horn.x;
    if (!(s > 0)) return;
    const x = (kol: number): number => horn.x + kol * s;
    const y = (rad: number): number => horn.y + rad * s;
    // Staden tonas ner mot papper. Tända rutor skärs ut ur tonen nedan.
    g.fillStyle = `rgba(${PAPPER}, 0.6)`;
    g.fillRect(x(0), y(0), b.kolumner * s, b.rader * s);
    const k0 = Math.max(0, Math.floor(-horn.x / s));
    const k1 = Math.min(b.kolumner - 1, Math.floor((bredd - horn.x) / s));
    const r0 = Math.max(0, Math.floor(-horn.y / s));
    const r1 = Math.min(b.rader - 1, Math.floor((hojd - horn.y) / s));
    monster ??= randning(g);
    const tjock = Math.max(1, Math.min(2.5, s / 28));
    for (const r of rutor) {
      if (r.kol < k0 || r.kol > k1 || r.rad < r0 || r.rad > r1) continue;
      const rx = x(r.kol);
      const ry = y(r.rad);
      if (r.lage === 'fri') {
        // En ledig ruta är mark som saknas på kartan. Den lyfts fram ur det grå, så att den
        // går att skilja från marken utanför staden, som ingen ritar.
        g.fillStyle = LEDIG;
        g.fillRect(rx, ry, s, s);
        continue;
      }
      if (r.lage === 'live') {
        g.clearRect(rx, ry, s, s);
        g.strokeStyle = MOSS;
        g.setLineDash([]);
      } else if (r.lage === 'godkand') {
        g.fillStyle = 'hsl(120 24% 23% / 0.22)';
        g.fillRect(rx, ry, s, s);
        g.strokeStyle = MOSS;
        g.setLineDash([tjock * 3, tjock * 2]);
      } else if (r.lage === 'vantar') {
        if (monster) {
          g.fillStyle = monster;
          g.fillRect(rx, ry, s, s);
        }
        g.strokeStyle = BARNSTEN;
        g.setLineDash([]);
      } else {
        g.fillStyle = 'hsl(25 60% 40% / 0.16)';
        g.fillRect(rx, ry, s, s);
        g.strokeStyle = ROST;
        g.setLineDash([tjock * 3, tjock * 2]);
      }
      g.lineWidth = tjock;
      g.strokeRect(rx + tjock / 2, ry + tjock / 2, s - tjock, s - tjock);
      if (s >= 84 && r.namn) namnskylt(g, r, rx, ry, s);
    }
    g.setLineDash([]);
    // Rutnätets linjer syns först när en ruta är stor nog att peka på.
    if (s >= 9) {
      g.strokeStyle = `hsl(45 17% 5% / ${s >= 24 ? 0.2 : 0.1})`;
      g.lineWidth = 1;
      g.beginPath();
      for (let kol = k0; kol <= k1 + 1; kol += 1) {
        g.moveTo(Math.round(x(kol)) + 0.5, Math.max(0, y(0)));
        g.lineTo(Math.round(x(kol)) + 0.5, Math.min(hojd, y(b.rader)));
      }
      for (let rad = r0; rad <= r1 + 1; rad += 1) {
        g.moveTo(Math.max(0, x(0)), Math.round(y(rad)) + 0.5);
        g.lineTo(Math.min(bredd, x(b.kolumner)), Math.round(y(rad)) + 0.5);
      }
      g.stroke();
    }
    if (vald) {
      const rx = x(vald.kol);
      const ry = y(vald.rad);
      g.lineWidth = 6;
      g.strokeStyle = '#fff';
      g.strokeRect(rx, ry, s, s);
      g.lineWidth = 3;
      g.strokeStyle = BLACK;
      g.strokeRect(rx, ry, s, s);
    }
  }

  function randning(g: CanvasRenderingContext2D): CanvasPattern | null {
    const bit = document.createElement('canvas');
    bit.width = 12;
    bit.height = 12;
    const b = bit.getContext('2d');
    if (!b) return null;
    b.fillStyle = `rgba(${PAPPER}, 0.55)`;
    b.fillRect(0, 0, 12, 12);
    b.strokeStyle = 'hsl(38 74% 33% / 0.6)';
    b.lineWidth = 3;
    b.beginPath();
    b.moveTo(-3, 9);
    b.lineTo(9, -3);
    b.moveTo(3, 15);
    b.lineTo(15, 3);
    b.stroke();
    return g.createPattern(bit, 'repeat');
  }

  function namnskylt(g: CanvasRenderingContext2D, r: Ruta, rx: number, ry: number, s: number): void {
    const text = r.namn ?? '';
    g.font = '500 12px "JetBrains Mono", ui-monospace, monospace';
    const bredd = Math.min(s - 12, g.measureText(text).width + 12);
    g.fillStyle = r.lage === 'live' ? MOSS : '#fff';
    g.fillRect(rx + 6, ry + s - 28, bredd, 22);
    g.fillStyle = r.lage === 'live' ? '#fff' : BLACK;
    g.textBaseline = 'middle';
    g.save();
    g.beginPath();
    g.rect(rx + 6, ry + s - 28, bredd, 22);
    g.clip();
    g.fillText(text, rx + 12, ry + s - 17);
    g.restore();
  }

  // ---- panelen till vänster

  function ritaStader(): void {
    // Städer som är ritade för hand har en knapp. En plats som frivilliga har börjat rita får
    // ingen: de blir många, och de nås med en länk eller med raden till agenten.
    stader.replaceChildren(
      ...bladen.filter((b) => !b.rutnat || b === aktivt).map((b) => {
        const a = el('a', 'bygge__stad', b.namn);
        a.href = ankare(b.id);
        if (b === aktivt) a.setAttribute('aria-current', 'true');
        return a;
      }),
    );
  }

  function ritaRakning(): void {
    const n = rakna(rutor);
    const tal = el('p', 'bygge__tal');
    tal.append(el('strong', undefined, n.tanda.toLocaleString('sv-SE')), ` av ${n.totalt.toLocaleString('sv-SE')} rutor tända`);
    const matare = el('div', 'bygge__matare');
    matare.setAttribute('role', 'img');
    matare.setAttribute('aria-label', `${n.tanda} av ${n.totalt} rutor tända`);
    const fylld = el('div');
    fylld.style.width = `${n.totalt ? Math.max(n.tanda ? 1 : 0, (100 * n.tanda) / n.totalt) : 0}%`;
    matare.append(fylld);
    const rad = el('p', 'bygge__nu', `${n.lasta} byggs nu · ${n.vantar + n.godkanda} väntar · ${n.fria.toLocaleString('sv-SE')} lediga`);
    rakning.replaceChildren(tal, matare, rad);
    nastaKnapp.disabled = n.fria === 0;

    const topp = topplista(rutor);
    if (topp.length === 0) {
      lista.replaceChildren(el('p', 'bygge__tomt', 'Ingen ruta är tänd än. Ta den första.'));
      return;
    }
    const ol = el('ol', 'bygge__topp');
    for (const t of topp) {
      const li = el('li');
      li.append(el('span', 'bygge__namn', t.namn), el('span', 'bygge__antal', `${t.rutor} ${t.rutor === 1 ? 'ruta' : 'rutor'}`));
      ol.append(li);
    }
    lista.replaceChildren(el('h2', 'bygge__rubrik', 'Flest tända rutor'), ol);
  }

  // ---- bladet för en vald ruta

  function ritaBlad(): void {
    const b = aktivt;
    if (!b || !vald) {
      blad.hidden = true;
      blad.replaceChildren();
      return;
    }
    const { kol, rad } = vald;
    const r = perPlats.get(`${kol}_${rad}`);
    const text = lage(r?.lage ?? 'fri');
    const huvud = el('div', 'bygge__bladhuvud');
    const titel = el('div');
    titel.append(el('p', 'kicker', b.namn), el('h2', 'bygge__rutnamn', `Ruta ${kol}_${rad}`));
    const stang = el('button', 'bygge__stang', 'Stäng');
    stang.type = 'button';
    stang.addEventListener('click', () => valj(null));
    huvud.append(titel, el('span', `bygge__lage bygge__lage--${r?.lage ?? 'ute'}`, r ? text.namn : 'Utanför'), stang);
    const delar: HTMLElement[] = [huvud];
    if (!r) {
      delar.push(el('p', 'bygge__mening', 'Rutan ligger utanför staden och ritas inte.'));
    } else if (r.lage !== 'fri') {
      delar.push(el('p', 'bygge__mening', text.mening));
      if (r.namn) {
        const vem = el('p', 'bygge__vem');
        const a = el('a', undefined, r.namn);
        a.href = `https://github.com/${encodeURIComponent(r.namn)}`;
        a.rel = 'noopener';
        vem.append('Byggare: ', a);
        delar.push(vem);
      }
    } else {
      const lista = el('ul', 'bygge__krav');
      for (const k of krav(b.id)) lista.append(el('li', undefined, k));
      const kostar = el('p', 'bygge__fot', 'Första gången laddas cirka 20 GB ner. Sedan tar en ruta några minuter.');
      // Den som bygger från Googles bilder ska veta det innan hen börjar.
      const varning =
        kalla(b.id) === 'google'
          ? el('p', 'bygge__fot', `${b.namn} ritas från Googles 3D-bilder via ditt Cesium-konto. Googles regler tillåter inte det. Läs punkt 10 i villkoren och avgör själv.`)
          : null;
      const rad1 = agentrad(b.id, kol, rad);
      const kod = el('div', 'bygge__kod');
      const knapp = el('button', 'bygge__kopiera', 'Kopiera raden');
      knapp.type = 'button';
      knapp.addEventListener('click', () => {
        navigator.clipboard?.writeText(rad1).then(
          () => (knapp.textContent = 'Kopierad'),
          () => (knapp.textContent = 'Markera raden och kopiera'),
        );
      });
      kod.append(el('code', undefined, rad1), knapp);
      const sjalv = el('p', 'bygge__sjalv');
      sjalv.append('Eller kör själv: ', el('code', undefined, `rutor claim ${b.id} ${kol}_${rad}`));
      const repo = el('a', 'knapp bygge__repo', 'Öppna repot på GitHub →');
      repo.href = REPO;
      repo.rel = 'noopener';
      const villkor = el('p', 'bygge__fot');
      const lank = el('a', undefined, 'Läs villkoren');
      lank.href = `${REPO}/blob/main/TERMS.md`;
      lank.rel = 'noopener';
      villkor.append('Frivilligt och oavlönat. Rutan är din i 48 timmar. En människa granskar den innan den tänds. ', lank, '.');
      delar.push(el('h3', 'bygge__rubrik', 'Du behöver'), lista, kostar);
      if (varning) delar.push(varning);
      delar.push(el('h3', 'bygge__rubrik', 'Ge raden till din AI-agent'), kod, sjalv, repo, villkor);
    }
    blad.replaceChildren(...delar);
    blad.hidden = false;
  }

  function valj(ruta: { kol: number; rad: number } | null, flytta = false): void {
    vald = ruta;
    if (aktivt) history.replaceState(null, '', ankare(aktivt.id, ruta?.kol, ruta?.rad));
    ritaBlad();
    if (ruta && flytta && visare && OSD) {
      const kant = RUTA * 2.5;
      visare.viewport.fitBounds(visare.viewport.imageToViewportRectangle(ruta.kol * RUTA - kant, ruta.rad * RUTA - kant, RUTA + 2 * kant, RUTA + 2 * kant));
    }
    rita();
  }

  /** Den lediga ruta som rutor claim --next skulle ge: intill en tänd ruta om det finns en
      sådan, och bland dem den som ligger närmast bladets mitt. */
  function nastaLediga(): { kol: number; rad: number } | null {
    const b = aktivt;
    if (!b) return null;
    const mitt = (r: Ruta): number => (r.kol - (b.kolumner - 1) / 2) ** 2 + (r.rad - (b.rader - 1) / 2) ** 2;
    const intill = (r: Ruta): boolean => {
      for (let dk = -1; dk <= 1; dk += 1) {
        for (let dr = -1; dr <= 1; dr += 1) {
          if ((dk || dr) && perPlats.get(`${r.kol + dk}_${r.rad + dr}`)?.lage === 'live') return true;
        }
      }
      return false;
    };
    const lediga = rutor.filter((r) => r.lage === 'fri');
    const narmast = lediga.filter(intill);
    const urval = narmast.length ? narmast : lediga;
    let bast: Ruta | null = null;
    for (const r of urval) {
      if (!bast || mitt(r) < mitt(bast) || (mitt(r) === mitt(bast) && (r.rad < bast.rad || (r.rad === bast.rad && r.kol < bast.kol)))) bast = r;
    }
    return bast ? { kol: bast.kol, rad: bast.rad } : null;
  }

  // ---- data och bildvisare

  async function laddaRutor(): Promise<void> {
    const b = aktivt;
    if (!b) return;
    try {
      const svar = (await hamta(`${tjanst}/v1/grid/${b.id}`)) as { cells?: unknown };
      if (b !== aktivt) return;
      rutor = lasRutor(svar?.cells);
      perPlats = new Map(rutor.map((r) => [`${r.kol}_${r.rad}`, r]));
      sag('');
    } catch {
      sag('Rutnätet svarar inte just nu. Kartan visas utan rutornas läge.');
    }
    ritaRakning();
    ritaBlad();
    rita();
  }

  async function oppna(b: Blad, ruta: { kol: number; rad: number } | null): Promise<void> {
    aktivt = b;
    rutor = [];
    perPlats = new Map();
    vald = null;
    // Raden om vad staden ritas från följer bladet.
    for (const rad of val.el.querySelectorAll<HTMLElement>('[data-kalla]')) rad.hidden = rad.dataset.kalla !== kalla(b.id);
    ritaStader();
    ritaRakning();
    if (!visare) {
      const { default: bibliotek } = await import('openseadragon');
      OSD = bibliotek;
      visare = bibliotek({
        element: kartEl,
        prefixUrl: '',
        // Bildrutorna kommer från en annan adress än sidan.
        crossOriginPolicy: 'Anonymous',
        showNavigationControl: false,
        showNavigator: false,
        gestureSettingsMouse: { clickToZoom: false, dblClickToZoom: true },
        gestureSettingsTouch: { clickToZoom: false, dblClickToZoom: true },
        gestureSettingsPen: { clickToZoom: false },
        visibilityRatio: 0.6,
        minZoomImageRatio: 0.8,
        maxZoomPixelRatio: 2,
        animationTime: 0.5,
      });
      for (const handelse of ['update-viewport', 'open', 'resize', 'animation'] as const) visare.addHandler(handelse, rita);
      visare.addHandler('canvas-click', (h) => {
        if (!h.quick || !aktivt || !visare) return;
        h.preventDefaultAction = true;
        const p = visare.viewport.viewerElementToImageCoordinates(h.position);
        valj(rutaVidPunkt(aktivt, p.x, p.y));
      });
    }
    const bildkalla = bilder
      ? kartbild(bilder, b.id, lasUtgava(utgavor, b.id))
      : { width: b.kolumner * RUTA, height: b.rader * RUTA, tileSize: 512, getTileUrl: () => TOM_RUTA };
    visare.addOnceHandler('open', () => {
      if (ruta) valj(ruta, true);
      else valj(null);
    });
    visare.open(bildkalla as unknown as OpenSeadragon.TileSourceSpecifier);
    await laddaRutor();
  }

  function foljAdressen(): void {
    const mal = lasAnkare(location.hash);
    // Utan adress öppnas den första staden där det finns något kvar att rita.
    const b = bladen.find((x) => x.id === mal?.blad) ?? aktivt ?? bladen.find((x) => !x.rutnat && x.totalt > x.tanda) ?? bladen[0];
    const ruta = mal && mal.kol !== null && mal.rad !== null && mal.kol < b.kolumner && mal.rad < b.rader ? { kol: mal.kol, rad: mal.rad } : null;
    if (b !== aktivt) void oppna(b, ruta);
    else if (ruta) valj(ruta, true);
  }

  // Raden till agenten kopieras med en knapp. Går det inte markeras raden, så att den kan kopieras för hand.
  const agentText = val.el.querySelector<HTMLElement>('[data-agentrad]');
  const kopiera = val.el.querySelector<HTMLButtonElement>('[data-kopiera-agent]');
  kopiera?.addEventListener('click', () => {
    const text = agentText?.textContent?.trim() ?? '';
    navigator.clipboard
      .writeText(text)
      .then(() => {
        kopiera.textContent = 'Kopierad';
        window.setTimeout(() => (kopiera.textContent = 'Kopiera →'), 2000);
      })
      .catch(() => {
        if (!agentText) return;
        const urval = window.getSelection();
        const omrade = document.createRange();
        omrade.selectNodeContents(agentText);
        urval?.removeAllRanges();
        urval?.addRange(omrade);
      });
  });

  nastaKnapp.addEventListener('click', () => {
    const ruta = nastaLediga();
    if (ruta) valj(ruta, true);
  });
  q<HTMLButtonElement>('in').addEventListener('click', () => visare?.viewport.zoomBy(1.6));
  q<HTMLButtonElement>('ut').addEventListener('click', () => visare?.viewport.zoomBy(1 / 1.6));
  addEventListener('hashchange', foljAdressen);
  addEventListener('keydown', (h) => {
    if (h.key === 'Escape' && vald) valj(null);
  });
  // Rutnätet hämtas om var minut medan sidan syns, så att en ny låsning syns utan omladdning.
  setInterval(() => {
    if (document.visibilityState === 'visible') void laddaRutor();
  }, 60_000);
  foljAdressen();
}
