// Byggkartan: sajtens karta över Sverige, med pixelstäderna och rutnätet ovanpå.
//
// Rutnätet ritas när kartan är så nära att en ruta syns. Ritade, granskade och upptagna rutor har färg,
// lediga är tomma rutor att klicka på. Vilken ruta ett klick betyder avgör rut-tjänsten
// (/v1/place), inte sidan: då kan sidan aldrig erbjuda en ruta som en claim inte tar.
//
// Allt som kommer från tjänsten och från OpenStreetMap är data från andra. Det läses fält för
// fält och skrivs in i sidan som text, aldrig som HTML.

import type { Map as MapLibreMap, GeoJSONSource, LngLatBoundsLike } from 'maplibre-gl';
import type { Pixelkarta } from '../pixelkarta/pixelkarta';
import { meterPerPunkt } from '../pixelkarta/geometri.ts';
import { bladFranRad, bladIRutan, bladMedId, rutansHorn, rutorAttRita, rutorIBild, type Bladrad, type Ritblad } from './natet.ts';
import { REPO, agentrad, agentradFler, ankare, kalla, krav, lage, lasAnkare, lasRutor } from './rutnat.ts';

interface Val {
  el: HTMLElement;
  tjanst: string;
  bilder?: string;
  worker?: string;
}

const SVERIGE: LngLatBoundsLike = [[10.6, 55.1], [24.4, 69.2]];
const GRUNDTAK = 14;
/** Rutnätet ritas när en ruta är minst så här många skärmpunkter bred. */
const MINSTA_RUTA_PX = 14;
/** Från den här zoomen står byggarens namn på ritade rutor: en ruta är då runt 65 punkter bred. */
const NAMN_FRAN_ZOOM = 13.5;
const RUTA_M = 256;
/** Så många rutor ritas som mest på en gång. */
const STORST_ANTAL = 15000;
/** Hur länge ett blads rutor gäller innan de hämtas igen, i millisekunder. */
const RUTOR_GALLER = 60_000;
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const FARG = {
  live: 'hsl(120, 24%, 35%)',
  godkand: 'hsl(170, 40%, 30%)',
  vantar: 'hsl(38, 74%, 40%)',
  last: 'hsl(25, 60%, 45%)',
  fri: 'hsl(45, 17%, 20%)',
  vald: 'hsl(25, 70%, 42%)',
};

interface Svar {
  ok: boolean;
  data: unknown;
}

async function hamta(adress: string): Promise<Svar> {
  try {
    const svar = await fetch(adress, { headers: { Accept: 'application/json' } });
    return { ok: svar.ok, data: await svar.json().catch(() => null) };
  } catch {
    return { ok: false, data: null };
  }
}

const tal = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const heltal = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;
const BLAD_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** En rad från /v1/sheets eller /v1/place, läst fält för fält. Null när något saknas. */
function lasRad(v: unknown): (Bladrad & { namn: string; handgjord: boolean; state: string }) | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as Record<string, unknown>;
  if (typeof r.id !== 'string' || !BLAD_ID.test(r.id)) return null;
  if (!heltal(r.cols) || !heltal(r.rows) || r.cols < 1 || r.rows < 1 || r.cols > 2000 || r.rows > 2000) return null;
  if (!tal(r.origin_lat) || !tal(r.origin_lon) || !tal(r.x_meters) || !tal(r.y_meters)) return null;
  return {
    id: r.id,
    cols: r.cols,
    rows: r.rows,
    origin_lat: r.origin_lat,
    origin_lon: r.origin_lon,
    x_meters: r.x_meters,
    y_meters: r.y_meters,
    ground_height: tal(r.ground_height) ? r.ground_height : 0,
    namn: typeof r.name === 'string' ? r.name.slice(0, 40) : r.id,
    handgjord: r.made !== 'grid',
    state: typeof r.state === 'string' ? r.state : '',
  };
}

function el<K extends keyof HTMLElementTagNameMap>(tagg: K, klass?: string, text?: string): HTMLElementTagNameMap[K] {
  const nod = document.createElement(tagg);
  if (klass) nod.className = klass;
  if (text !== undefined) nod.textContent = text;
  return nod;
}

export async function startaByggkarta(val: Val): Promise<void> {
  const tjanst = val.tjanst.replace(/\/+$/, '');
  const q = <T extends HTMLElement>(namn: string): T => val.el.querySelector<T>(`[data-${namn}]`)!;
  const kartEl = q<HTMLDivElement>('karta');
  const panel = q<HTMLElement>('ruta');
  const besked = q<HTMLParagraphElement>('besked');
  const sokform = q<HTMLFormElement>('sok');
  const sokfalt = q<HTMLInputElement>('sokfalt');
  const zoomtips = q<HTMLParagraphElement>('zoomtips');

  const sag = (text: string): void => {
    besked.textContent = text;
    besked.hidden = text === '';
  };

  // ---- bladen

  /** Städer ritade för hand: deras rutor ritas ur deras egna rader, och marken är deras. */
  const stader: (Ritblad & { namn: string; state: string })[] = [];
  /** Blad ur rutnätet som någon har tagit en ruta i: de har en rad, med markhöjd. */
  const lagrade = new Map<string, Bladrad & { namn: string }>();
  const svar = await hamta(`${tjanst}/v1/sheets`);
  const rader = svar.ok && svar.data && typeof svar.data === 'object' ? (svar.data as { sheets?: unknown }).sheets : null;
  if (!Array.isArray(rader)) {
    sag('Rutnätet svarar inte just nu. Kartan fungerar ändå.');
  } else {
    for (const v of rader) {
      const r = lasRad(v);
      if (!r) continue;
      if (r.handgjord) stader.push({ ...bladFranRad(r), namn: r.namn, state: r.state });
      else lagrade.set(r.id, r);
    }
  }

  /** Bladet att rita för ett id ur rutnätet: den lagrade raden när den finns, annars det uträknade. */
  function rutnatsblad(id: string): Ritblad | null {
    const rad = lagrade.get(id) ?? bladMedId(id);
    return rad ? bladFranRad(rad) : null;
  }

  // ---- kartan

  const { Map: Karta, setWorkerUrl } = await import('maplibre-gl');
  if (val.worker) setWorkerUrl(new URL(val.worker, location.href).href);
  let pixel: Pixelkarta | null = null;
  const karta: MapLibreMap = new Karta({
    container: kartEl,
    style: 'https://tiles.openfreemap.org/styles/positron',
    bounds: SVERIGE,
    renderWorldCopies: false,
    maxZoom: GRUNDTAK,
    attributionControl: { compact: true },
    // Över en pixelstad får kartan gå djupare än annars, som på startsidan.
    transformConstrain: (plats, zoom) => ({ center: plats, zoom: Math.min(zoom, pixel?.zoomtak(plats.lng, plats.lat, zoom) ?? GRUNDTAK) }),
  });
  await new Promise<void>((klar) => karta.once('load', () => klar()));

  if (val.bilder) {
    // Pixelstäderna, som på startsidan. Svarar bildtjänsten inte är det den vanliga kartan.
    const modul = await import('../pixelkarta/pixelkarta');
    pixel = await modul.kopplaPixelkarta({ karta, el: kartEl, app: val.el, bas: val.bilder, grundtak: GRUNDTAK }).catch(() => null);
    if (pixel) {
      // Kartan kan nu gå djupare. Den nya gränsen gäller från nästa rörelse.
      karta.setMaxZoom(Math.max(karta.getMaxZoom(), 19));
    }
  }

  // Rutnätet ligger över pixelstäderna: det läggs till sist.
  karta.addSource('natet', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  karta.addSource('vald', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  karta.addLayer({
    id: 'natet-yta',
    type: 'fill',
    source: 'natet',
    paint: {
      'fill-color': ['match', ['get', 'lage'], 'live', FARG.live, 'godkand', FARG.godkand, 'vantar', FARG.vantar, 'last', FARG.last, FARG.fri],
      'fill-opacity': ['match', ['get', 'lage'], 'live', 0.12, 'godkand', 0.35, 'vantar', 0.35, 'last', 0.4, 0.02],
    },
  });
  karta.addLayer({
    id: 'natet-kant',
    type: 'line',
    source: 'natet',
    paint: {
      'line-color': ['match', ['get', 'lage'], 'live', FARG.live, FARG.fri],
      'line-opacity': ['match', ['get', 'lage'], 'live', 0.25, 0.4],
      'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.9, 16, 1.2],
    },
  });
  // Byggarens namn på varje ritad ruta, när rutorna är stora nog att bära det.
  karta.addLayer({
    id: 'natet-namn',
    type: 'symbol',
    source: 'natet',
    minzoom: NAMN_FRAN_ZOOM,
    filter: ['all', ['has', 'namn'], ['!=', ['get', 'lage'], 'fri']],
    layout: {
      'text-field': ['get', 'namn'],
      'text-font': ['Noto Sans Regular'],
      'text-size': ['interpolate', ['linear'], ['zoom'], NAMN_FRAN_ZOOM, 11, 17, 13],
      'text-max-width': 8,
    },
    paint: { 'text-color': '#1c1a17', 'text-halo-color': '#fdfbf7', 'text-halo-width': 1.6 },
  });
  // Den valda rutan får en ljus kant under den färgade, så att den syns även ovanpå en ritad stad.
  karta.addLayer({
    id: 'vald-ljus',
    type: 'line',
    source: 'vald',
    paint: { 'line-color': '#fdfbf7', 'line-width': 7 },
  });
  karta.addLayer({
    id: 'vald-kant',
    type: 'line',
    source: 'vald',
    paint: { 'line-color': FARG.vald, 'line-width': 3.5 },
  });

  // ---- rutorna i bild

  const rutorFor = new Map<string, { tid: number; per: Map<string, { lage: string; namn: string | null }> }>();
  async function rutorI(blad: string): Promise<Map<string, { lage: string; namn: string | null }>> {
    const har = rutorFor.get(blad);
    if (har && Date.now() - har.tid < RUTOR_GALLER) return har.per;
    const per = new Map<string, { lage: string; namn: string | null }>();
    const r = await hamta(`${tjanst}/v1/grid/${encodeURIComponent(blad)}`);
    const celler = r.ok && r.data && typeof r.data === 'object' ? (r.data as { cells?: unknown }).cells : null;
    for (const ruta of lasRutor(celler)) per.set(`${ruta.kol}_${ruta.rad}`, { lage: ruta.lage, namn: ruta.namn });
    rutorFor.set(blad, { tid: Date.now(), per });
    return per;
  }

  let ritning = 0;
  async function ritaNatet(): Promise<void> {
    const nr = (ritning += 1);
    const mitt = karta.getCenter();
    const mpp = meterPerPunkt(mitt.lat, karta.getZoom());
    const kalla = karta.getSource('natet') as GeoJSONSource | undefined;
    if (!kalla) return;
    if (RUTA_M / mpp < MINSTA_RUTA_PX) {
      kalla.setData({ type: 'FeatureCollection', features: [] });
      zoomtips.hidden = false;
      return;
    }
    const g = karta.getBounds();
    const ruta = { west: g.getWest(), east: g.getEast(), south: g.getSouth(), north: g.getNorth() };
    const features: GeoJSON.Feature[] = [];
    const lagg = (blad: Ritblad, id: string, kol: number, rad: number, l: string, namn: string | null): void => {
      if (features.length >= STORST_ANTAL) return;
      const egenskaper: GeoJSON.GeoJsonProperties = namn ? { blad: id, kol, rad, lage: l, namn } : { blad: id, kol, rad, lage: l };
      features.push({ type: 'Feature', properties: egenskaper, geometry: { type: 'Polygon', coordinates: [rutansHorn(blad, kol, rad)] } });
    };
    // Städerna ritade för hand: deras egna rutor, utom de som inte erbjuds.
    for (const stad of stader) {
      const i = rutorIBild(stad, ruta);
      if (!i.length) continue;
      const per = await rutorI(stad.rad.id);
      for (const r of i) {
        const finns = per.get(`${r.kol}_${r.rad}`);
        if (finns) lagg(stad, stad.rad.id, r.kol, r.rad, finns.lage, finns.namn);
      }
    }
    // Rutnätet över resten av landet. Rutor som ingen har tagit är lediga.
    for (const b0 of bladIRutan(ruta)) {
      const blad = rutnatsblad(b0.id);
      if (!blad) continue;
      const i = rutorAttRita(blad, stader, ruta);
      if (!i.length) continue;
      const per = lagrade.has(b0.id) ? await rutorI(b0.id) : new Map<string, { lage: string; namn: string | null }>();
      for (const r of i) {
        const finns = per.get(`${r.kol}_${r.rad}`);
        lagg(blad, b0.id, r.kol, r.rad, finns?.lage ?? 'fri', finns?.namn ?? null);
      }
    }
    if (nr !== ritning) return; // kartan har hunnit flytta sig
    kalla.setData({ type: 'FeatureCollection', features });
    // Tipset står kvar tills rutor syns. Ett klick öppnar bara en ruta som syns.
    zoomtips.hidden = features.length > 0;
  }

  let vantar: number | undefined;
  karta.on('moveend', () => {
    window.clearTimeout(vantar);
    vantar = window.setTimeout(() => void ritaNatet(), 120);
  });

  // ---- en ruta

  function visaVald(blad: Ritblad | null, kol = 0, rad = 0): void {
    const k = karta.getSource('vald') as GeoJSONSource | undefined;
    k?.setData({
      type: 'FeatureCollection',
      features: blad ? [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [rutansHorn(blad, kol, rad)] } }] : [],
    });
  }

  function stang(): void {
    panel.hidden = true;
    visaVald(null);
    if (location.hash) history.replaceState(null, '', location.pathname);
  }

  async function oppna(lat: number, lon: number): Promise<void> {
    const r = await hamta(`${tjanst}/v1/place?lat=${lat.toFixed(6)}&lon=${lon.toFixed(6)}`);
    if (!r.ok) {
      const kod = r.data && typeof r.data === 'object' ? (r.data as { error?: unknown }).error : null;
      sag(kod === 'outside' ? 'Där ligger inte Sverige. Rutor finns bara i Sverige.' : 'Rutnätet svarar inte just nu. Försök igen om en stund.');
      return;
    }
    sag('');
    const d = r.data as { sheet?: unknown; col?: unknown; row?: unknown; state?: unknown };
    const rad = lasRad(d.sheet);
    if (!rad || !heltal(d.col) || !heltal(d.row)) return;
    const blad = bladFranRad(rad);
    const kol = d.col;
    const rd = d.row;
    const l = typeof d.state === 'string' ? d.state : 'fri';
    visaVald(blad, kol, rd);
    history.replaceState(null, '', ankare(rad.id, kol, rd));
    const per = rad.handgjord || lagrade.has(rad.id) ? await rutorI(rad.id) : null;
    fyllPanel(rad, kol, rd, l, per?.get(`${kol}_${rd}`)?.namn ?? null);
    // I mobilen täcker panelen kartans nedre del. Rutan flyttas upp ovanför den.
    if (matchMedia('(max-width: 760px)').matches) {
      const m = blad.projektion.tillMark((kol + 0.5) * 1024, (rd + 0.5) * 1024);
      karta.easeTo({ center: [m.lon, m.lat], offset: [0, -panel.offsetHeight / 2], duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 300 });
    }
  }

  function fyllPanel(rad: Bladrad & { namn: string; handgjord: boolean; state: string }, kol: number, rd: number, l: string, byggare: string | null): void {
    // Huvudet: var rutan ligger, vilken ruta, och dess läge som en liten etikett.
    const huvud = el('div', 'byggkarta__rutahuvud');
    const rubriker = el('div');
    rubriker.append(el('p', 'kicker', rad.handgjord ? rad.namn : 'Ny plats'), el('h2', undefined, `Ruta ${kol}_${rd}`));
    const stang_ = el('button', 'byggkarta__stang', 'Stäng');
    stang_.type = 'button';
    stang_.addEventListener('click', stang);
    huvud.append(rubriker, stang_);
    const delar: HTMLElement[] = [huvud];

    if (l === 'ute') {
      const text = rad.state === 'done' ? 'Staden är färdigritad. Här finns inget kvar att rita.' : 'Den här rutan ritas inte.';
      delar.push(el('p', 'byggkarta__lage', text));
      panel.replaceChildren(...delar);
      panel.hidden = false;
      return;
    }

    const t = lage(l);
    const status = el('p', 'byggkarta__lage');
    const etikett = el('span', `byggkarta__etikett byggkarta__etikett--${l}`, t.namn);
    status.append(etikett, ` ${t.mening}`);
    delar.push(status);
    if (byggare) {
      const vem = el('p', 'byggkarta__byggare', 'Ritad av ');
      const lank = el('a', undefined, byggare);
      lank.href = `https://github.com/${encodeURIComponent(byggare)}`;
      lank.rel = 'noopener';
      vem.append(lank);
      delar.push(vem);
    }

    if (l === 'fri') {
      // Tre steg. Raden till agenten finns i två varianter: en ruta, eller rutan och sedan fler.
      const rader = { en: agentrad(rad.id, kol, rd), fler: agentradFler(rad.id, kol, rd) };
      const steg = el('ol', 'byggkarta__steg');

      const steg1 = el('li');
      const rubrik1 = el('div', 'byggkarta__stegrubrik');
      rubrik1.append(el('span', undefined, 'Ge raden till din AI-agent'));
      const val = el('div', 'byggkarta__val');
      val.setAttribute('role', 'group');
      val.setAttribute('aria-label', 'Hur många rutor');
      const knappEn = el('button', undefined, 'En ruta');
      const knappFler = el('button', undefined, 'Flera');
      const kodruta = el('div', 'byggkarta__kodruta');
      const kod = el('p', 'byggkarta__agentrad', rader.en);
      const kopieraKnapp = el('button', 'byggkarta__kopiera', 'Kopiera →');
      kopieraKnapp.type = 'button';
      kopieraKnapp.addEventListener('click', () => kopiera(kod, kopieraKnapp));
      kodruta.append(kod, kopieraKnapp);
      const flerNot = el('p', 'byggkarta__not', 'En ruta i taget. Högst fem väntar på granskning.');
      flerNot.hidden = true;
      const valj = (fler: boolean): void => {
        kod.textContent = fler ? rader.fler : rader.en;
        knappEn.setAttribute('aria-pressed', String(!fler));
        knappFler.setAttribute('aria-pressed', String(fler));
        flerNot.hidden = !fler;
      };
      for (const [knapp, fler] of [[knappEn, false], [knappFler, true]] as const) {
        knapp.type = 'button';
        knapp.addEventListener('click', () => valj(fler));
        val.append(knapp);
      }
      valj(false);
      rubrik1.append(val);
      steg1.append(rubrik1, kodruta, flerNot);

      const steg2 = el('li');
      steg2.append(el('div', 'byggkarta__stegrubrik', 'Agenten ritar på ditt grafikkort'));
      const steg3 = el('li');
      steg3.append(el('div', 'byggkarta__stegrubrik', 'En människa granskar. Sedan syns ditt namn.'));
      steg.append(steg1, steg2, steg3);
      delar.push(steg);

      // Kraven fälls ihop: sammanfattningen säger det viktigaste, listan resten.
      const behov = el('details', 'byggkarta__behov');
      const sammanfattning = el('summary');
      sammanfattning.append(el('span', undefined, 'Det här behövs'), el('span', 'byggkarta__kort', 'NVIDIA-kort, GitHub' + (kalla(rad.id) === 'google' ? ', Cesium' : '')));
      const lista = el('ul', 'byggkarta__krav');
      for (const k of krav(rad.id)) lista.append(el('li', undefined, k));
      const lank = el('a', undefined, 'Allt som krävs, i repot →');
      lank.href = `${REPO}#what-you-need`;
      lank.rel = 'noopener';
      behov.append(sammanfattning, lista);
      if (kalla(rad.id) === 'google') behov.append(el('p', 'byggkarta__not', 'Ritas från Googles 3D-bilder, genom ditt eget Cesium-konto.'));
      behov.append(lank);
      delar.push(behov);
    }
    panel.replaceChildren(...delar);
    panel.hidden = false;
  }

  function kopiera(kod: HTMLElement, knapp: HTMLButtonElement): void {
    navigator.clipboard
      .writeText(kod.textContent?.trim() ?? '')
      .then(() => {
        knapp.textContent = 'Kopierad';
        window.setTimeout(() => (knapp.textContent = 'Kopiera →'), 2000);
      })
      .catch(() => {
        const urval = window.getSelection();
        const omrade = document.createRange();
        omrade.selectNodeContents(kod);
        urval?.removeAllRanges();
        urval?.addRange(omrade);
      });
  }

  karta.on('click', (h) => {
    // Bara när rutnätet syns: längre ut är ett klick på kartan bara ett klick på kartan.
    if (!zoomtips.hidden) return;
    void oppna(h.lngLat.lat, h.lngLat.lng);
  });

  // ---- adressen: #blad/kol_rad, som rutor skriver ut efter en claim och en uppladdning

  async function foljAdressen(): Promise<void> {
    const mal = lasAnkare(location.hash);
    if (!mal || mal.kol === null || mal.rad === null) return;
    const stad = stader.find((s) => s.rad.id === mal.blad);
    const blad = stad ?? rutnatsblad(mal.blad);
    if (!blad || mal.kol >= blad.rad.cols || mal.rad >= blad.rad.rows) return;
    const m = blad.projektion.tillMark((mal.kol + 0.5) * 1024, (mal.rad + 0.5) * 1024);
    karta.jumpTo({ center: [m.lon, m.lat], zoom: 15.5 });
    await oppna(m.lat, m.lon);
  }
  addEventListener('hashchange', () => void foljAdressen());

  // ---- sök en ort

  sokform.addEventListener('submit', async (h) => {
    h.preventDefault();
    const namn = sokfalt.value.trim();
    if (namn.length < 2) return;
    // OpenStreetMaps sökning, en fråga per tryck. Den används aldrig medan man skriver.
    const adress = `${NOMINATIM}?${new URLSearchParams({ q: namn, format: 'jsonv2', limit: '1', countrycodes: 'se' })}`;
    const r = await hamta(adress);
    const traff = Array.isArray(r.data) && r.data[0] && typeof r.data[0] === 'object' ? (r.data[0] as { lat?: unknown; lon?: unknown }) : null;
    const lat = traff && typeof traff.lat === 'string' ? Number(traff.lat) : NaN;
    const lon = traff && typeof traff.lon === 'string' ? Number(traff.lon) : NaN;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      sag(r.ok ? `Hittade ingen plats som heter ${namn.slice(0, 40)} i Sverige.` : 'Sökningen svarar inte just nu.');
      return;
    }
    sag('');
    karta.jumpTo({ center: [lon, lat], zoom: 15 });
    await oppna(lat, lon);
  });

  addEventListener('keydown', (h) => {
    if (h.key === 'Escape' && !panel.hidden) stang();
  });

  await ritaNatet();
  await foljAdressen();
}
