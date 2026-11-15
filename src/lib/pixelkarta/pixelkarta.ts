// Pixelkartan: Stockholm, Göteborg och Malmö ritade som pixelstäder, i sajtens egen karta.
//
// Sajtens karta leder hela tiden. Pixelstaden är ingen egen karta med eget läge, utan en bild
// under den platta kartan:
//
//   1. Långt ute ligger varje stad som en liten ö på den platta kartan (en enda bild).
//   2. När en stad kommer nära lutar sig kartan lite för varje zoomsteg, tills den ligger i
//      pixelkartans vinkel (geometri.ts). Besökarens eget zoomande är hela rörelsen.
//   3. Där öppnas en glugg i den platta kartan längs stadens kant, och genom den syns
//      pixelstaden i full skärpa. Den ritas av en bildvisare som ligger under kartan och
//      följer kartans kamera, bildruta för bildruta.
//
// Sajtens prickar, grupper, sökning och flygningar ligger kvar ovanpå och fungerar som förut,
// eftersom det fortfarande är samma karta.
//
// Koden är öppen som resten av sajten. Kartbilderna är det inte: de hämtas från en bildtjänst
// som bara svarar sajten, och adressen dit sätts vid bygget (PUBLIC_PIXELKARTA_URL). Utan den
// laddas den här filen aldrig. Svarar tjänsten inte är sajten den vanliga kartan.

import type { Map as MapLibreMap, CustomLayerInterface, MapMouseEvent, ImageSource } from 'maplibre-gl';
import type OpenSeadragon from 'openseadragon';
import {
  type Kartfil,
  type Stad,
  type Hus,
  type Projektion,
  type Narhet,
  VINKEL,
  SYNFALT,
  skapaProjektion,
  meterPerPunkt,
  zoomVid,
  hemskala,
  narhet,
  lutning,
  glugg,
  iBild,
} from './geometri.ts';
import './pixelkarta.css';

export interface Val {
  karta: MapLibreMap;
  /** Kartans eget element. Bildvisaren läggs under kartbilden i det. */
  el: HTMLElement;
  app: HTMLElement;
  /** Adressen till bildtjänsten, fram till och med versionen. */
  bas: string;
  /** Kartans största zoom utan pixelkarta. */
  grundtak: number;
}

export interface Pixelkarta {
  /** Kartans största zoom över en plats: djupare över en pixelstad. `zoom` är den zoom kartbiblioteket frågar för. */
  zoomtak(lng: number, lat: number, zoom?: number): number;
  /** Om pixelkartan visas. */
  pa(): boolean;
  /** Slår av eller på pixelkartan. Valet sparas i webbläsaren. */
  satt(pa: boolean): void;
  /**
   * Platsen i vattnet för en organisation som saknar exakt adress och hör till en pixelstad.
   * Null för alla andra, och när pixelkartan inte visas: då står den där sajten annars ställer den.
   */
  vatten(id: string): { lng: number; lat: number } | null;
  /** Hur nära kartan går när en organisation i en pixelstad väljs, eller null för sajtens vanliga avstånd. */
  narzoom(id: string): number | null;
  /** Den valda organisationen: dess hus ritas ut i pixelstaden, och staden runt det tonas ner. */
  markera(id: string | null): void;
  /** Organisationen som pekas på: dess hus får en tunn kant. */
  peka(id: string | null): void;
  /** Anropas när platserna i vattnet börjar eller slutar gälla, så att sajten kan rita om sina prickar. */
  vidByte(lyssnare: () => void): void;
  /** Läget just nu, för prov och felsökning. */
  tillstand(): { stad: string; glugg: number; forberedd: boolean; ritad: boolean; avvikelse: number | null }[];
  /** Husmarkeringen just nu, för prov: vilket hus som är ritat, om staden är tonad och var huset ligger i rutan. */
  husprov(): { vald: string | null; tonad: boolean; ritat: boolean; ruta: { x: number; y: number; b: number; h: number } | null };
}

/** Ett hus med sin form som bild, hämtad först när den behövs. */
interface Husbild extends Hus {
  bild: HTMLImageElement | null;
}

interface Lage {
  stad: Stad;
  projektion: Projektion;
  /** Kartbildens hörn på marken, medurs från övre vänstra: [lng, lat]. */
  horn: [number, number][];
  mitt: { lat: number; lng: number };
  /** Stadens kant: bilden, dess alfa för att slå upp en plats, och texturen i kartans ritning. */
  kantbild: HTMLImageElement | null;
  kantalfa: { data: Uint8ClampedArray; bredd: number; hojd: number } | null;
  kanttextur: WebGLTexture | null;
  /** Gluggens öppning: den som visas och den som kameran ber om. */
  visad: number;
  mal: number;
  /** Öns bild gick inte att hämta. */
  outan: boolean;
}

/** Så många bildpunkter i kartbilden får en skärmpunkt som mest förstoras till. */
const STORST_FORSTORING = 4;
/** Bildvisaren förbereds när staden är så här nära, i "hela staden i bild". */
const FORBERED = 4;
/** Husen ritas ut när kartan är så här nära, i meter mark per skärmpunkt: i färg, och med kant. */
const HUS_FARG = 4.5;
const HUS_KANT = 9;
/** Så nära går kartan när en organisation väljs, i meter mark per skärmpunkt: till ett hus, och till en plats i vattnet. */
const NARA_HUS = 0.8;
const NARA_VATTEN = 3;
/** Namnet valet sparas under i webbläsaren. */
const MINNE = 'pixelkarta';
/** Källan och lagret som bär pixelkartans rad bland kartans källor. */
const KALLRAD = 'pixelkarta-kalla';
/** Den som har gjort pixelkartan. Namnet står i ett märke i kartans hörn och i raden med kartans källor. */
const SKAPARE = { namn: 'Gustaf Baltsar Garnow', lank: 'https://headless.design' };

const IKON =
  '<svg class="ik" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>';

function minne(varde?: string): string | null {
  try {
    if (varde === undefined) return window.localStorage.getItem(MINNE);
    if (varde) window.localStorage.setItem(MINNE, varde);
    else window.localStorage.removeItem(MINNE);
  } catch {
    // En webbläsare som inte sparar något: valet gäller besöket.
  }
  return null;
}

export async function kopplaPixelkarta(val: Val): Promise<Pixelkarta | null> {
  const { karta, el, app } = val;
  const bas = val.bas.replace(/\/+$/, '') + '/';
  let fil: Kartfil;
  try {
    const svar = await fetch(bas + 'karta.json');
    if (!svar.ok) throw new Error(String(svar.status));
    fil = (await svar.json()) as Kartfil;
  } catch {
    // Bildtjänsten svarar inte: sajten är den vanliga kartan, utan besked.
    return null;
  }
  const mpb = fil.metersPerPixel;
  const lagen: Lage[] = fil.cities.map((stad) => {
    const projektion = skapaProjektion(stad.map, mpb);
    const h = (x: number, y: number): [number, number] => {
      const m = projektion.tillMark(x, y);
      return [m.lon, m.lat];
    };
    const mitt = projektion.tillMark(stad.map.width / 2, stad.map.height / 2);
    return {
      stad,
      projektion,
      horn: [h(0, 0), h(stad.map.width, 0), h(stad.map.width, stad.map.height), h(0, stad.map.height)],
      mitt: { lat: mitt.lat, lng: mitt.lon },
      kantbild: null,
      kantalfa: null,
      kanttextur: null,
      visad: 0,
      mal: 0,
      outan: false,
    };
  });

  // Var sajtens organisationer står i pixelstäderna. De utan exakt adress har en plats i vattnet:
  // sajten ställer dem annars i ett rutnät mitt i kommunen, och på en karta där varje hus syns
  // läses en prick på ett hus som det huset. De med adress har ett hus, som kan ritas ut.
  const vattenplatser = new Map<string, { lng: number; lat: number }>();
  const husAv = new Map<string, { lage: Lage; hus: Husbild }>();
  for (const lage of lagen) {
    for (const [id, [x, y]] of Object.entries(lage.stad.water ?? {})) {
      const m = lage.projektion.tillMark(x, y);
      vattenplatser.set(id, { lng: m.lon, lat: m.lat });
    }
    const hus = new Map<string, Husbild>();
    for (const [id, nyckel] of Object.entries(lage.stad.addresses ?? {})) {
      const h = lage.stad.houses?.[nyckel];
      if (!h) continue;
      if (!hus.has(nyckel)) hus.set(nyckel, { ...h, bild: null });
      husAv.set(id, { lage, hus: hus.get(nyckel) as Husbild });
    }
  }

  let vald = minne() !== 'av'; // besökarens val
  let trasig = false; // bildtjänsten har slutat svara
  let vilar = app.dataset.vy === 'medlemmar'; // en vy med egen kamera har kartan
  let fri = false; // lutningen lämnar kameran i fred medan den jämnas ut för hand
  const aktiv = (): boolean => vald && !trasig && !vilar;
  // Slås pixelkartan av eller på medan kartan är i rörelse, eller tar någon annan kameran
  // strax efter (sajtens egen flygning till medlemsvyn, besökarens hjul när bildtjänsten
  // brister), får den rörelsen vara i fred. Lutningen och djupet tonas då in eller ut i den,
  // under en kort stund räknad från skiftet, och utan att någonsin gå åt fel håll. Skiftet
  // gäller tills den rörelsen är över.
  let skifte = 0;
  const SKIFTESTID = 500;
  const skiftesandel = (): number => (skifte ? Math.min(1, (performance.now() - skifte) / SKIFTESTID) : 1);

  // Rutans storlek läses när den ändras, inte för varje bildruta: en läsning mitt i kartans ritning kan tvinga sidan att räkna om sin layout.
  const mat = (): { bredd: number; hojd: number } => ({ bredd: Math.max(1, el.clientWidth), hojd: Math.max(1, el.clientHeight) });
  let rutstorlek = mat();
  karta.on('resize', () => {
    rutstorlek = mat();
  });
  const ruta = (): { bredd: number; hojd: number } => rutstorlek;
  const narhetVid = (lage: Lage, lat: number, lng: number, zoom: number): Narhet => narhet(lage.stad.map, lage.projektion, mpb, ruta(), { lat, lng, zoom });
  const lutningVid = (lat: number, lng: number, zoom: number): number => Math.max(0, ...lagen.map((lage) => lutning(narhetVid(lage, lat, lng, zoom))));
  /** Rutans mitt på marken. Kartans egen mitt kan vara förskjuten av en marginal. */
  const mittIRutan = (): { lat: number; lng: number } => {
    const r = ruta();
    return karta.unproject([r.bredd / 2, r.hojd / 2]);
  };

  /* ---------- lutningen ---------- */

  // Varje ändring av kartans kamera går här igenom, besökarens hjul och fingrar liksom varje
  // flygning: lutningen är den som hör till platsen kameran är på väg till.
  karta.setTransformCameraUpdate((nasta) => {
    if (fri) return {};
    const pa = aktiv();
    if (!pa && !skifte) return {};
    const andel = skiftesandel();
    const mal = lutningVid(nasta.center.lat, nasta.center.lng, nasta.zoom);
    // Lutningen kartan har är den som senast ritades. Den begärda kameran (nasta) bär lutningen
    // från rörelsens början, och ett svar utan lutning skulle sätta tillbaka just den.
    const har = karta.getPitch();
    // På: mot platsens lutning. Utan skifte är det platsens lutning rakt av.
    if (pa) return { pitch: Math.max(Math.min(har, mal), mal * andel) };
    // Av: ner mot platt, och platt tills rörelsen är över.
    return { pitch: Math.min(har, mal * (1 - andel)) };
  });
  // Med smalt synfält visar den lutade kartan marken som pixelkartan gör. Avslagen har kartan sitt eget synfält.
  const grundfalt = karta.getVerticalFieldOfView();
  // Kartan får gå djupare över en pixelstad. Var den får det avgör zoomtak(), som sajtens karta frågar.
  const stadstak = (lage: Lage): number => zoomVid(lage.mitt.lat, mpb / STORST_FORSTORING);
  karta.setMaxZoom(Math.max(val.grundtak, ...lagen.map(stadstak)));

  /**
   * Om en plats är en där kartans kamera kan stå: rakt bakom mitten längs blickriktningen, hur
   * långt som helst upp till kamerans hela avstånd. Hur långt beror på lutningen hos den kamera
   * kartbiblioteket frågar för, och den kan vara en annan än den kartan ritas med just nu.
   */
  function arKameran(lng: number, lat: number): boolean {
    const varld = 512 * 2 ** karta.getZoom();
    const x = (l: number): number => ((l + 180) / 360) * varld;
    const y = (b: number): number => (0.5 - Math.log(Math.tan(Math.PI / 4 + (b * Math.PI) / 360)) / (2 * Math.PI)) * varld;
    const mitt = karta.getCenter();
    const helt = (0.5 / Math.tan((karta.getVerticalFieldOfView() * Math.PI) / 360)) * ruta().hojd;
    const riktning = (karta.getBearing() * Math.PI) / 180;
    const dx = x(lng) - x(mitt.lng);
    const dy = y(lat) - y(mitt.lat);
    const bakat = -dx * Math.sin(riktning) + dy * Math.cos(riktning);
    const sida = dx * Math.cos(riktning) + dy * Math.sin(riktning);
    return bakat > 1 && bakat <= helt * 1.02 && Math.abs(sida) <= Math.max(2, helt * 0.01);
  }

  /** Största zoom över en plats: fullt djup över en stads kartbild, avtagande en bit utanför den. */
  function takVid(lng: number, lat: number): number {
    // Slås pixelkartan av mitt i en rörelse avtar djupet under samma stund som lutningen.
    const kvar = aktiv() || fri ? 1 : 1 - skiftesandel();
    let tak = val.grundtak;
    for (const lage of lagen) {
      const p = lage.projektion.tillBild(lat, lng);
      const blad = lage.stad.map;
      const utanfor = Math.max(Math.max(0, -p.x, p.x - blad.width) / blad.width, Math.max(0, -p.y, p.y - blad.height) / blad.height);
      const andel = Math.min(1, Math.max(0, 1 - utanfor / 0.08));
      tak = Math.max(tak, val.grundtak + (stadstak(lage) - val.grundtak) * andel * kvar);
    }
    return tak;
  }

  // Pixelstaden är ritad från ett håll och i en vinkel. Medan pixelkartan är på går kartan
  // därför inte att vrida eller luta för hand: lutningen sköter kartan själv, och norr är uppåt.
  // Avslagen får kartan tillbaka de gester den hade.
  const hadeVridning = karta.dragRotate.isEnabled();
  const hadeLutning = karta.touchPitch.isEnabled();
  function styrGester() {
    const fritt = !aktiv();
    if (hadeVridning) {
      if (fritt) karta.dragRotate.enable();
      else karta.dragRotate.disable();
    }
    if (hadeLutning) {
      if (fritt) karta.touchPitch.enable();
      else karta.touchPitch.disable();
    }
    if (fritt) {
      karta.touchZoomRotate.enableRotation();
      karta.keyboard.enableRotation();
    } else {
      karta.touchZoomRotate.disableRotation();
      karta.keyboard.disableRotation();
    }
  }

  /* ---------- öarna ---------- */

  const lager = karta.getStyle().layers ?? [];
  const forstaText = lager.find((l) => l.type === 'symbol')?.id;
  const kallaAv = (l: (typeof lager)[number]): string | undefined => (l as { source?: string }).source;
  const baskalla = lager.map(kallaAv).find(Boolean);
  // Sajtens egna lager ligger sist i stilen. Gluggen läggs under dem och över allt i baskartan.
  const forstaEget = lager.find((l) => kallaAv(l) && kallaAv(l) !== baskalla)?.id;
  for (const lage of lagen) {
    const id = `pixelo-${lage.stad.id}`;
    karta.addSource(id, { type: 'image', url: bas + lage.stad.map.island, coordinates: lage.horn as [[number, number], [number, number], [number, number], [number, number]] });
    karta.addLayer({ id, type: 'raster', source: id, paint: { 'raster-fade-duration': 0, 'raster-saturation': ['interpolate', ['linear'], ['zoom'], 5, -0.35, 9, 0] } }, forstaText);
    hamtaKant(lage);
  }
  // En ö som inte går att hämta är bildtjänsten som inte svarar.
  karta.on('error', (e) => {
    const kalla = (e as { sourceId?: string }).sourceId;
    const lage = kalla?.startsWith('pixelo-') ? lagen.find((l) => `pixelo-${l.stad.id}` === kalla) : undefined;
    if (!lage) return;
    lage.outan = true;
    brast();
  });

  /** Stadens kant hämtas: som bild till gluggen, och som alfa för att slå upp om en plats är ritad. */
  function hamtaKant(lage: Lage) {
    const bild = new Image();
    bild.crossOrigin = 'anonymous';
    bild.onload = () => {
      lage.kantbild = bild;
      const duk = document.createElement('canvas');
      duk.width = bild.naturalWidth;
      duk.height = bild.naturalHeight;
      const c = duk.getContext('2d', { willReadFrequently: true });
      if (c) {
        c.drawImage(bild, 0, 0);
        lage.kantalfa = { data: c.getImageData(0, 0, duk.width, duk.height).data, bredd: duk.width, hojd: duk.height };
      }
      uppdatera();
    };
    // Utan kanten finns ingen glugg att öppna, och kartan skulle luta sig över en stad som aldrig visas.
    bild.onerror = () => brast();
    bild.src = bas + lage.stad.map.edge;
  }

  // Vem som har gjort pixelkartan och vad den bygger på står där kartans övriga källor står.
  // Raden hör till en tom källa med ett eget lager, och syns när det lagret gör det.
  karta.addSource(KALLRAD, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
    attribution: `Pixelkarta © <a href="${SKAPARE.lank}" target="_blank" rel="noopener">${SKAPARE.namn}</a> · underlag Google 3D Tiles`,
  });
  karta.addLayer({ id: KALLRAD, type: 'circle', source: KALLRAD });

  /** Staden som är ritad på en plats, eller ingen: kartbildens ruta är större än staden. */
  function ritadStad(lat: number, lng: number): Lage | null {
    for (const lage of lagen) {
      const p = lage.projektion.tillBild(lat, lng);
      const a = lage.kantalfa;
      if (!iBild(lage.stad.map, p) || !a) continue;
      const x = Math.min(a.bredd - 1, Math.floor((p.x / lage.stad.map.width) * a.bredd));
      const y = Math.min(a.hojd - 1, Math.floor((p.y / lage.stad.map.height) * a.hojd));
      if (a.data[(y * a.bredd + x) * 4 + 3] > 128) return lage;
    }
    return null;
  }

  /* ---------- gluggen ---------- */

  // Ett eget lager i kartans ritning som suddar ut det som ritats under det, längs stadens kant.
  // Det som ligger bakom kartbilden syns då igenom: bildvisaren med pixelstaden.
  //
  // Lagret ritar alltid hela rutan och räknar för varje skärmpunkt ut var i stadens kartbild
  // den ligger. Tre punkter mitt i rutan ger sambandet, som är rätlinjigt eftersom kartan
  // ses nästan utan perspektiv. Stadens hörn används inte: långt inne i staden ligger de
  // bakom kartans kamera och går inte att placera på skärmen.
  const gluggen: CustomLayerInterface = (() => {
    let program: WebGLProgram | null = null;
    let buffert: WebGLBuffer | null = null;
    let aPlats = -1;
    let aUv = -1;
    let uKant: WebGLUniformLocation | null = null;
    let uStyrka: WebGLUniformLocation | null = null;
    const hornpunkter = new Float32Array(16);
    const gor = (gl: WebGLRenderingContext | WebGL2RenderingContext) => {
      const skuggare = (typ: number, kalla: string): WebGLShader | null => {
        const sk = gl.createShader(typ);
        if (!sk) return null;
        gl.shaderSource(sk, kalla);
        gl.compileShader(sk);
        return gl.getShaderParameter(sk, gl.COMPILE_STATUS) ? sk : null;
      };
      const hornskuggare = skuggare(gl.VERTEX_SHADER, 'attribute vec2 a_plats; attribute vec2 a_uv; varying vec2 v_uv; void main() { v_uv = a_uv; gl_Position = vec4(a_plats, 0.0, 1.0); }');
      const ytskuggare = skuggare(
        gl.FRAGMENT_SHADER,
        'precision highp float; uniform sampler2D u_kant; uniform float u_styrka; varying vec2 v_uv; void main() { float inne = step(0.0, v_uv.x) * step(v_uv.x, 1.0) * step(0.0, v_uv.y) * step(v_uv.y, 1.0); gl_FragColor = vec4(0.0, 0.0, 0.0, texture2D(u_kant, v_uv).a * u_styrka * inne); }',
      );
      const nytt = gl.createProgram();
      if (!nytt || !hornskuggare || !ytskuggare) return;
      gl.attachShader(nytt, hornskuggare);
      gl.attachShader(nytt, ytskuggare);
      gl.linkProgram(nytt);
      if (!gl.getProgramParameter(nytt, gl.LINK_STATUS)) return;
      program = nytt;
      aPlats = gl.getAttribLocation(nytt, 'a_plats');
      aUv = gl.getAttribLocation(nytt, 'a_uv');
      uKant = gl.getUniformLocation(nytt, 'u_kant');
      uStyrka = gl.getUniformLocation(nytt, 'u_styrka');
      buffert = gl.createBuffer();
    };
    // En förlorad ritkontext tar program, buffert och texturer med sig. De görs om vid nästa ritning.
    const glomt = () => {
      program = null;
      buffert = null;
      for (const lage of lagen) lage.kanttextur = null;
    };
    return {
      id: 'pixelkarta-glugg',
      type: 'custom',
      renderingMode: '2d',
      // Program och buffert görs när de först behövs, och på nytt om kartan har fått en ny ritkontext.
      onAdd() {
        karta.on('webglcontextlost', glomt);
      },
      render(gl: WebGLRenderingContext | WebGL2RenderingContext) {
        if (!lagen.some((lage) => lage.visad >= 0.002 && lage.kantbild)) return;
        if (!program || !buffert) gor(gl);
        if (!program || !buffert) return;
        const r = ruta();
        let forberett = false;
        for (const lage of lagen) {
          if (lage.visad < 0.002 || !lage.kantbild) continue;
          if (!lage.kanttextur) {
            lage.kanttextur = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, lage.kanttextur);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
            gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, lage.kantbild);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          }
          if (!forberett) {
            forberett = true;
            gl.useProgram(program);
            gl.bindBuffer(gl.ARRAY_BUFFER, buffert);
            gl.enableVertexAttribArray(aPlats);
            gl.enableVertexAttribArray(aUv);
            gl.vertexAttribPointer(aPlats, 2, gl.FLOAT, false, 16, 0);
            gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 16, 8);
            // Det som redan är ritat blir kvar i den mån kanten är genomskinlig. Inget nytt läggs till.
            gl.enable(gl.BLEND);
            gl.blendFuncSeparate(gl.ZERO, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE_MINUS_SRC_ALPHA);
            gl.activeTexture(gl.TEXTURE0);
            gl.uniform1i(uKant, 0);
          }
          // Var i kartbilden rutans mitt ligger, och hur långt hundra skärmpunkter åt höger och nedåt är där.
          const bild = (x: number, y: number): { x: number; y: number } => {
            const m = karta.unproject([x, y]);
            return lage.projektion.tillBild(m.lat, m.lng);
          };
          const mx = r.bredd / 2;
          const my = r.hojd / 2;
          const i0 = bild(mx, my);
          const ix = bild(mx + 100, my);
          const iy = bild(mx, my + 100);
          const blad = lage.stad.map;
          // Rutans fyra hörn: övre vänstra, övre högra, nedre vänstra, nedre högra.
          [[0, 0], [1, 0], [0, 1], [1, 1]].forEach(([hx, hy], n) => {
            const dx = (hx * r.bredd - mx) / 100;
            const dy = (hy * r.hojd - my) / 100;
            const u = (i0.x + (ix.x - i0.x) * dx + (iy.x - i0.x) * dy) / blad.width;
            const v = (i0.y + (ix.y - i0.y) * dx + (iy.y - i0.y) * dy) / blad.height;
            hornpunkter.set([hx * 2 - 1, 1 - hy * 2, u, v], n * 4);
          });
          gl.bufferData(gl.ARRAY_BUFFER, hornpunkter, gl.DYNAMIC_DRAW);
          gl.bindTexture(gl.TEXTURE_2D, lage.kanttextur);
          gl.uniform1f(uStyrka, lage.visad);
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        }
      },
      onRemove(_karta: MapLibreMap, gl: WebGLRenderingContext | WebGL2RenderingContext) {
        karta.off('webglcontextlost', glomt);
        for (const lage of lagen) if (lage.kanttextur) gl.deleteTexture(lage.kanttextur);
        if (buffert) gl.deleteBuffer(buffert);
        if (program) gl.deleteProgram(program);
        glomt();
      },
    };
  })();
  karta.addLayer(gluggen, forstaEget);
  // Efter en förlorad ritkontext bygger kartan upp sin stil igen, men inte egna lager som det här.
  // Det läggs tillbaka när stilen finns.
  karta.on('webglcontextrestored', () => {
    const tillbaka = () => {
      try {
        if (!karta.getLayer(gluggen.id)) karta.addLayer(gluggen, forstaEget && karta.getLayer(forstaEget) ? forstaEget : undefined);
      } catch {
        return; // stilen är inte klar än: nästa gång den säger till
      }
      karta.off('styledata', tillbaka);
      stall();
    };
    karta.on('styledata', tillbaka);
    tillbaka();
  });

  /* ---------- bildvisaren under kartan ---------- */

  const stadEl = document.createElement('div');
  stadEl.className = 'pixelstad';
  stadEl.setAttribute('aria-hidden', 'true');
  stadEl.inert = true;
  el.insertBefore(stadEl, el.firstChild);

  let bibliotek: typeof OpenSeadragon | null = null;
  let visare: OpenSeadragon.Viewer | null = null;
  let visarlofte: Promise<OpenSeadragon.Viewer | null> | null = null;
  let oppen: Lage | null = null; // staden vars kartbild bildvisaren har öppen eller håller på att öppna
  let redo = false; // kartbilden är öppnad
  let sedd = false; // och har ritats en gång i sin helhet
  let rutor = { komna: 0, fel: 0 };

  function skapaVisare(): Promise<OpenSeadragon.Viewer | null> {
    visarlofte ??= import('openseadragon')
      .then(({ default: OSD }) => {
        bibliotek = OSD;
        const v = OSD({
          element: stadEl,
          prefixUrl: '',
          // Bildrutorna kommer från en annan adress än sidan.
          crossOriginPolicy: 'Anonymous',
          showNavigationControl: false,
          showNavigator: false,
          // Kartan leder: bildvisaren tar inga egna rörelser och har inga egna gränser.
          mouseNavEnabled: false,
          animationTime: 0,
          minZoomImageRatio: 0.01,
          maxZoomPixelRatio: 64,
          visibilityRatio: 0,
          preserveImageSizeOnResize: true,
        });
        v.addHandler('open', () => {
          const bild = v.world.getItemAt(0);
          const stad = oppen;
          // Har kartan hunnit vidare till en annan stad medan den här öppnades är det inte den som väntas.
          const rutadress = String((bild?.source as { tilesUrl?: string } | undefined)?.tilesUrl ?? '');
          if (!bild || !stad || !rutadress.includes(stad.stad.map.dzi.replace(/\.dzi(\?.*)?$/, '_files'))) return;
          redo = true;
          sedd = false;
          rutor = { komna: 0, fel: 0 };
          folj();
          // Gluggen öppnas först när kartbilden har ritats i sin helhet en gång.
          const ritad = () => {
            if (sedd || oppen !== stad || !bild.getFullyLoaded()) return;
            sedd = true;
            uppdatera();
          };
          bild.addHandler('fully-loaded-change', ritad);
          ritad();
        });
        v.addHandler('open-failed', () => {
          oppen = null;
          if (aktiv()) brast();
        });
        v.addHandler('tile-loaded', () => {
          rutor.komna += 1;
          rutor.fel = 0;
        });
        v.addHandler('tile-load-failed', () => {
          // Avslagen frågar pixelkartan inte efter något nytt. Det som uteblir då sägs inte.
          if (!aktiv()) return;
          rutor.fel += 1;
          // Bildruta efter bildruta uteblir: tjänsten svarar inte, nekar eller har nått sin gräns.
          if (rutor.fel >= (rutor.komna ? 8 : 3)) brast();
        });
        // Varje gång bildvisaren har ritat, i kartans bildruta eller i sin egen takt när skarpare
        // bildrutor kommer, ritas husen om över dess nya bild.
        v.addHandler('update-viewport', ritaHus);
        visare = v;
        return v;
      })
      .catch(() => {
        visarlofte = null; // nästa försök hämtar bildvisaren på nytt
        brast();
        return null;
      });
    return visarlofte;
  }

  /** Bildvisaren får stadens kartbild öppen, osedd, medan kartan närmar sig. */
  function forbered(lage: Lage) {
    if (oppen === lage) return;
    oppen = lage;
    redo = false;
    sedd = false;
    void skapaVisare().then((v) => {
      // Bildvisaren tar adressen till en beskrivning av bildrutorna, fast dess typer inte säger det.
      if (v && oppen === lage) v.open((bas + lage.stad.map.dzi) as unknown as OpenSeadragon.TileSourceSpecifier);
    });
  }

  /** Bildvisaren tar kartans vy: samma plats mitt i rutan, samma skala. Svarar om den ritade. */
  function folj(): boolean {
    if (!aktiv() || !visare || !redo || !oppen || !visare.world.getItemCount()) return false;
    const mitt = mittIRutan();
    const p = oppen.projektion.tillBild(mitt.lat, mitt.lng);
    const skala = mpb / meterPerPunkt(mitt.lat, karta.getZoom());
    const vp = visare.viewport;
    vp.zoomTo(vp.imageToViewportZoom(skala), undefined, true);
    vp.panTo(vp.imageToViewportCoordinates(p.x, p.y), true);
    // Osedd ritar bildvisaren i sin egen takt. Syns den genom gluggen skulle den då ligga en
    // bildruta efter kartan, och staden släpa efter prickarna när kartan dras. Då ritar den
    // här samma steg som i sin egen slinga, genast.
    if (oppen.visad <= 0 && oppen.mal <= 0) return false;
    vp.update();
    visare.world.update(true);
    (visare as unknown as { imageLoader: { clear(): void } }).imageLoader.clear();
    visare.world.draw();
    visare.raiseEvent('update-viewport', {});
    return true;
  }

  /** Största avståndet på skärmen mellan en plats i kartan och samma plats i bildvisaren, för prov. */
  function avvikelse(): number | null {
    if (!visare || !bibliotek || !redo || !oppen || !visare.world.getItemCount()) return null;
    const r = ruta();
    let storst = 0;
    for (const [ax, ay] of [[0.25, 0.25], [0.75, 0.25], [0.5, 0.5], [0.25, 0.75], [0.75, 0.75]]) {
      const m = karta.unproject([ax * r.bredd, ay * r.hojd]);
      const p = oppen.projektion.tillBild(m.lat, m.lng);
      const q = visare.viewport.imageToViewerElementCoordinates(new bibliotek.Point(p.x, p.y));
      storst = Math.max(storst, Math.hypot(q.x - ax * r.bredd, q.y - ay * r.hojd));
    }
    return storst;
  }

  /* ---------- husen ---------- */

  // Den valda organisationens hus ritas ut i pixelstaden: staden tonas ner mot papper och huset
  // behåller sina färger, med en kant runt. Husets form är en bild från bildtjänsten. Allt ritas
  // på en egen duk mellan bildvisaren och kartbilden, så att sajtens prickar och namn ligger
  // kvar överst.
  const husduk = document.createElement('canvas');
  husduk.className = 'pixelhus';
  husduk.setAttribute('aria-hidden', 'true');
  el.insertBefore(husduk, stadEl.nextSibling);
  const penna = husduk.getContext('2d');
  const ringduk = document.createElement('canvas');
  const ringpenna = ringduk.getContext('2d');
  const hjalpduk = document.createElement('canvas');
  const hjalppenna = hjalpduk.getContext('2d');
  const SVART = '#1c1a17';
  const GRADDE = '#fdfbf7';
  let markerad: string | null = null;
  let pekad: string | null = null;
  let tonad = false;
  let husritat: { x: number; y: number; b: number; h: number } | null = null;

  /** Husets form. Den hämtas första gången huset ska ritas, och huset ritas när den har kommit. */
  function husbild(hus: Husbild): HTMLImageElement | null {
    if (!hus.bild) {
      const bild = new Image();
      bild.crossOrigin = 'anonymous';
      bild.onload = () => ritaHus();
      bild.src = bas + hus.picture;
      hus.bild = bild;
    }
    return hus.bild.complete && hus.bild.naturalWidth ? hus.bild : null;
  }

  /** Huset som hör till en organisation, om det ligger i staden som visas. */
  const husIStaden = (id: string | null): Husbild | null => {
    const h = id ? husAv.get(id) : undefined;
    return h && h.lage === oppen ? h.hus : null;
  };

  function ritaHus() {
    if (!penna || !ringpenna || !hjalppenna) return;
    const r = ruta();
    const tathet = Math.min(window.devicePixelRatio || 1, 2);
    const bredd = Math.max(1, Math.round(r.bredd * tathet));
    const hojd = Math.max(1, Math.round(r.hojd * tathet));
    if (husduk.width !== bredd || husduk.height !== hojd) {
      husduk.width = bredd;
      husduk.height = hojd;
    } else {
      penna.globalCompositeOperation = 'source-over';
      penna.clearRect(0, 0, bredd, hojd);
    }
    husritat = null;
    const stad = oppen;
    const synlig = aktiv() && !!stad && redo && stad.visad > 0;
    const valt = synlig ? husIStaden(markerad) : null;
    const pekat = synlig && pekad !== markerad ? husIStaden(pekad) : null;
    // Staden är nedtonad så länge den valda organisationen har sitt hus i den.
    if (!!valt !== tonad) {
      tonad = !!valt;
      stadEl.classList.toggle('pixelstad--tonad', tonad);
    }
    if (!stad || !visare || !bibliotek || (!valt && !pekat)) return;
    husduk.style.opacity = String(stad.visad);
    // Var kartbilden ligger i rutan just nu, enligt bildvisaren: det är dess bild husen ritas över.
    const vp = visare.viewport;
    const nolla = vp.imageToViewerElementCoordinates(new bibliotek.Point(0, 0));
    const tusen = vp.imageToViewerElementCoordinates(new bibliotek.Point(1000, 0));
    const skala = (tusen.x - nolla.x) / 1000; // skärmpunkter per bildpunkt i kartbilden
    const meter = mpb / skala; // meter mark per skärmpunkt
    type Ruta = { x: number; y: number; b: number; h: number };
    const plats = (hus: Husbild): Ruta => ({ x: nolla.x + hus.x * skala, y: nolla.y + hus.y * skala, b: hus.w * skala, h: hus.h * skala });
    const iRutan = (p: Ruta): boolean => p.x < r.bredd && p.y < r.hojd && p.x + p.b > 0 && p.y + p.h > 0;

    // Det valda huset i sina färger: bildvisarens egen bild, behållen bara där huset är.
    if (valt && meter <= HUS_FARG) {
      const form = husbild(valt);
      const p = plats(valt);
      const kalla = (visare.drawer as unknown as { canvas?: HTMLCanvasElement }).canvas;
      if (form && kalla && kalla.width && iRutan(p)) {
        penna.imageSmoothingEnabled = skala < 1;
        penna.drawImage(form, p.x * tathet, p.y * tathet, p.b * tathet, p.h * tathet);
        penna.globalCompositeOperation = 'source-in';
        penna.imageSmoothingEnabled = true;
        penna.drawImage(kalla, 0, 0, kalla.width, kalla.height, 0, 0, bredd, hojd);
        penna.globalCompositeOperation = 'source-over';
        husritat = p;
      }
    }

    // En kant runt huset: formen vidgad åt alla håll, med huset självt utskuret igen.
    const kant = (hus: Husbild, stark: boolean) => {
      const form = husbild(hus);
      const p = plats(hus);
      if (!form || !iRutan(p)) return;
      const luft = Math.ceil(7 * tathet);
      const b = Math.ceil(p.b * tathet);
      const h = Math.ceil(p.h * tathet);
      if (b < 4 || h < 4 || b > 4096 || h > 4096) return;
      const helb = b + luft * 2;
      const helh = h + luft * 2;
      for (const duk of [ringduk, hjalpduk]) {
        if (duk.width !== helb || duk.height !== helh) {
          duk.width = helb;
          duk.height = helh;
        }
      }
      ringpenna.globalCompositeOperation = 'source-over';
      ringpenna.clearRect(0, 0, helb, helh);
      const lagg = (tjock: number, farg: string) => {
        hjalppenna.globalCompositeOperation = 'source-over';
        hjalppenna.clearRect(0, 0, helb, helh);
        hjalppenna.imageSmoothingEnabled = skala < 1;
        for (let k = 0; k < 16; k += 1) {
          const v = (k / 16) * Math.PI * 2;
          hjalppenna.drawImage(form, luft + Math.cos(v) * tjock * tathet, luft + Math.sin(v) * tjock * tathet, b, h);
        }
        hjalppenna.globalCompositeOperation = 'source-in';
        hjalppenna.fillStyle = farg;
        hjalppenna.fillRect(0, 0, helb, helh);
        ringpenna.drawImage(hjalpduk, 0, 0);
      };
      if (stark) lagg(5, SVART);
      lagg(stark ? 3 : 2.5, GRADDE);
      ringpenna.globalCompositeOperation = 'destination-out';
      ringpenna.imageSmoothingEnabled = skala < 1;
      ringpenna.drawImage(form, luft, luft, b, h);
      penna.drawImage(ringduk, Math.round(p.x * tathet) - luft, Math.round(p.y * tathet) - luft);
      if (stark) husritat ??= p;
    };
    if (meter <= HUS_KANT) {
      if (pekat) kant(pekat, false);
      if (valt) kant(valt, true);
    }
  }

  /* ---------- kameran avgör ---------- */

  let tonar = 0;
  let senast = 0;
  /** Gluggens öppning går mot den kameran ber om, på en kort stund, så att inget slår om. */
  function tona(nu: number) {
    tonar = 0;
    const steg = Math.min(1, (nu - senast) / 220);
    senast = nu;
    let kvar = false;
    for (const lage of lagen) {
      if (lage.visad === lage.mal) continue;
      const d = lage.mal - lage.visad;
      lage.visad = Math.abs(d) <= steg ? lage.mal : lage.visad + Math.sign(d) * steg;
      kvar ||= lage.visad !== lage.mal;
    }
    ritaHus();
    karta.triggerRepaint();
    if (kvar) tonar = requestAnimationFrame(tona);
  }

  /** Allt som följer av var kameran är: vilken stad som förbereds, och hur öppen gluggen är. */
  function uppdatera() {
    const pa = aktiv();
    const mitt = mittIRutan();
    const zoom = karta.getZoom();
    let narmast: Lage | null = null;
    let narmastAvstand = Infinity;
    for (const lage of lagen) {
      const n = narhetVid(lage, mitt.lat, mitt.lng, zoom);
      if (pa && n.ibild > 0 && n.avstand < FORBERED && n.avstand < narmastAvstand) {
        narmast = lage;
        narmastAvstand = n.avstand;
      }
      // Gluggen öppnas bara där kartan ligger i pixelkartans vinkel och pixelstaden finns att visa.
      const liggerRatt = Math.abs(karta.getPitch() - VINKEL) < 0.5 && Math.abs(karta.getBearing() - lage.stad.map.heading) < 0.5;
      lage.mal = pa && lage === oppen && sedd && lage.kantbild && liggerRatt ? glugg(n) : 0;
    }
    if (narmast) forbered(narmast);
    // Frågan under skaparens namn står där ingen pixelstad är öppen.
    marke.classList.toggle('skaparmarke--fraga', !lagen.some((lage) => lage.mal > 0.5));
    // Ritade bildvisaren ritades husen med den. Annars ritas de här: de kan behöva tas bort.
    if (!folj()) ritaHus();
    if (!tonar && lagen.some((lage) => lage.visad !== lage.mal)) {
      senast = performance.now();
      tonar = requestAnimationFrame(tona);
    }
  }
  karta.on('move', uppdatera);
  karta.on('resize', uppdatera);

  // Ett tryck på en ö leder in i staden, om trycket inte gäller något av sajtens egna lager.
  karta.on('click', (e: MapMouseEvent) => {
    if (!aktiv()) return;
    const lage = ritadStad(e.lngLat.lat, e.lngLat.lng);
    if (!lage) return;
    const mitt = mittIRutan();
    if (narhetVid(lage, mitt.lat, mitt.lng, karta.getZoom()).avstand < 2) return;
    if (karta.queryRenderedFeatures(e.point).some((f) => f.source !== baskalla)) return;
    karta.flyTo({ center: lage.mitt, zoom: zoomVid(lage.mitt.lat, hemskala(lage.stad.map, mpb, ruta())) });
  });

  /* ---------- av och på ---------- */

  // Vem som har gjort pixelkartan: ett märke i kartans hörn, med länk till skaparen. Över landet,
  // där städerna bara är öar, står också en fråga under namnet.
  const marke = document.createElement('a');
  marke.className = 'skaparmarke skaparmarke--fraga';
  marke.href = SKAPARE.lank;
  marke.target = '_blank';
  marke.rel = 'noopener';
  // Pilen följer med namnets sista ord om raden bryts, så att den aldrig står ensam på en rad.
  const ord = SKAPARE.namn.split(' ');
  const sist = ord.pop();
  const fore = ord.join(' ');
  marke.innerHTML =
    `<span class="skaparmarke__rad"><span class="skaparmarke__liten">Skapad av</span> ${fore} <span class="skaparmarke__sist">${sist} <span class="skaparmarke__pil" aria-hidden="true">↗</span></span></span>` +
    '<span class="skaparmarke__fraga">Vill du se din stad i pixlar? Hör av dig.</span>';
  el.parentElement?.appendChild(marke);

  const besked = document.createElement('p');
  besked.className = 'pixelbesked';
  besked.setAttribute('role', 'status');
  el.parentElement?.appendChild(besked);
  let beskedsklocka = 0;
  function sag(text: string, lange = 2600) {
    besked.textContent = text;
    besked.classList.add('pixelbesked--visas');
    window.clearTimeout(beskedsklocka);
    beskedsklocka = window.setTimeout(() => {
      besked.classList.remove('pixelbesked--visas');
      // Texten tas bort när den har tonat ut, så att den inte står kvar för en skärmläsare.
      beskedsklocka = window.setTimeout(() => (besked.textContent = ''), 300);
    }, lange);
  }

  let knapp: HTMLButtonElement | null = null;
  function visaKnapp() {
    if (!knapp) return;
    const pa = vald && !trasig;
    knapp.setAttribute('aria-pressed', String(pa));
    knapp.title = pa ? 'Pixelkartan är på. Tryck för den vanliga kartan.' : trasig ? 'Pixelkartan gick inte att ladda. Tryck för att försöka igen.' : 'Pixelkartan är av. Tryck för att slå på den.';
  }

  const lyssnare: (() => void)[] = [];
  let gallde = false; // om platserna i vattnet gällde senast sajten fick veta
  /** Det som följer direkt av att pixelkartan är av eller på: öarna, källraden, gesterna, synfältet. */
  function stall() {
    const pa = aktiv();
    if (pa !== gallde) {
      gallde = pa;
      for (const l of lyssnare) l();
    }
    try {
      if (!karta.getLayer(KALLRAD)) return;
    } catch {
      return; // kartan har ingen stil just nu (mellan en förlorad ritkontext och en ny)
    }
    for (const lage of lagen) karta.setLayoutProperty(`pixelo-${lage.stad.id}`, 'visibility', pa ? 'visible' : 'none');
    karta.setLayoutProperty(KALLRAD, 'visibility', pa ? 'visible' : 'none');
    app.classList.toggle('app--pixel', pa);
    styrGester();
    if (pa) karta.setVerticalFieldOfView(SYNFALT);
    else if (karta.getPitch() < 0.5) karta.setVerticalFieldOfView(grundfalt);
    uppdatera();
  }

  /** Pixelkartan har slagits av eller på. Kartan går till den lutning och det djup som gäller nu. */
  function skifta() {
    stall();
    skifte = performance.now();
    // Rör sig kartan redan är det någon annans rörelse. Då tonas lutningen i den, och resten jämnas ut när den är över.
    if (karta.isMoving() && !fri) return;
    jamna();
  }
  karta.on('moveend', () => {
    if (!skifte || fri) return;
    // Slutet på en rörelse kan vara början på nästa: en flygning avslutar den förra i samma
    // andetag som den själv börjar. En rörelse som startas härifrån skulle den då köra över
    // utan att säga till. Därför väntar utjämningen ett ögonblick och ser efter om kartan står still.
    window.setTimeout(() => {
      if (!skifte || fri || karta.isMoving()) return;
      skifte = 0;
      jamna();
    }, 0);
  });

  /** Kartan till den lutning och det djup som gäller där den ligger, i en mjuk rörelse. */
  function jamna() {
    const mitt = karta.getCenter();
    const pa = aktiv();
    const zoom = pa ? karta.getZoom() : Math.min(karta.getZoom(), val.grundtak);
    const pitch = pa ? lutningVid(mitt.lat, mitt.lng, zoom) : 0;
    // På ligger norr uppåt. Av behåller kartan den riktning besökaren har gett den.
    const bearing = pa ? 0 : karta.getBearing();
    if (Math.abs(pitch - karta.getPitch()) < 0.5 && zoom === karta.getZoom() && Math.abs(bearing - karta.getBearing()) < 0.5) {
      skifte = 0;
      return stall();
    }
    const stilla = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    fri = true;
    if (stilla) {
      karta.jumpTo({ pitch, zoom, bearing });
      fri = false;
      skifte = 0;
      stall();
      return;
    }
    // Rörelsen kan avbrytas av besökaren. Den är över när kartan säger det, eller senast strax efter sin tid.
    let over = false;
    const klar = () => {
      if (over) return;
      over = true;
      window.clearTimeout(vakt);
      karta.off('moveend', klar);
      fri = false;
      if (Math.abs(pitch - karta.getPitch()) < 0.5) {
        skifte = 0;
      } else {
        // Någon annan tog kameran innan rörelsen var klar. Resten tonas i den rörelsen, härifrån.
        skifte = performance.now();
      }
      stall();
    };
    const vakt = window.setTimeout(klar, 900);
    karta.easeTo({ pitch, zoom, bearing, duration: 500 });
    karta.on('moveend', klar);
  }

  /** Bildtjänsten svarar inte: tillbaka till den vanliga kartan, och det sägs. */
  function brast() {
    if (trasig) return;
    trasig = true;
    oppen = null;
    redo = false;
    sedd = false;
    visaKnapp();
    skifta();
    sag('Pixelkartan gick inte att ladda. Du ser den vanliga kartan.', 6000);
  }

  function satt(pa: boolean) {
    const forsokIgen = pa && trasig;
    vald = pa;
    trasig = false;
    minne(pa ? '' : 'av');
    if (forsokIgen) {
      rutor = { komna: 0, fel: 0 };
      for (const lage of lagen) {
        if (!lage.kantbild) hamtaKant(lage);
        if (!lage.outan) continue;
        lage.outan = false;
        (karta.getSource(`pixelo-${lage.stad.id}`) as ImageSource | undefined)?.updateImage({ url: bas + lage.stad.map.island });
      }
    }
    visaKnapp();
    skifta();
    sag(pa ? 'Pixelkartan är på.' : 'Pixelkartan är av. Du ser den vanliga kartan.');
  }

  const knappar = app.querySelector('.kartknappar');
  if (knappar) {
    knapp = document.createElement('button');
    knapp.type = 'button';
    knapp.className = 'kartknapp pixelbrytare';
    knapp.setAttribute('aria-label', 'Pixelkarta');
    knapp.innerHTML = IKON;
    knappar.insertBefore(knapp, knappar.firstChild);
    knapp.addEventListener('click', () => satt(!(vald && !trasig)));
  }

  // Medlemsvyn har sin egen kamera. Där vilar pixelkartan.
  new MutationObserver(() => {
    const nu = app.dataset.vy === 'medlemmar';
    if (nu === vilar) return;
    vilar = nu;
    skifta();
  }).observe(app, { attributes: true, attributeFilter: ['data-vy'] });

  visaKnapp();
  skifta();

  return {
    zoomtak(lng, lat, zoom) {
      // Medan kartan jämnas ut efter att pixelkartan slagits av gäller djupet ännu.
      if (!aktiv() && !fri && !skifte) return val.grundtak;
      // När besökaren zoomar med hjulet frågar kartbiblioteket med kamerans plats i stället för
      // kartans mitt, och med smalt synfält står kameran tiotals mil bakom mitten. Då gäller mitten.
      // Hjulet frågar för ett steg från den zoom kartan har. En flygning frågar för sitt mål, som
      // kan ligga långt bort och rakt bakom mitten utan att vara kameran: en vald organisation i
      // en stad söderut, sedd från hela landet. Den ska få stadens djup.
      const ettSteg = zoom === undefined || Math.abs(zoom - karta.getZoom()) < 1.5;
      if (ettSteg && arKameran(lng, lat)) {
        const nu = karta.getCenter();
        return takVid(nu.lng, nu.lat);
      }
      return takVid(lng, lat);
    },
    pa: () => vald && !trasig,
    vatten: (id) => (aktiv() ? (vattenplatser.get(id) ?? null) : null),
    narzoom(id) {
      if (!aktiv()) return null;
      const hus = husAv.get(id);
      if (hus) return zoomVid(hus.lage.mitt.lat, NARA_HUS);
      const plats = vattenplatser.get(id);
      return plats ? zoomVid(plats.lat, NARA_VATTEN) : null;
    },
    markera(id) {
      if (id === markerad) return;
      markerad = id;
      ritaHus();
    },
    peka(id) {
      if (id === pekad) return;
      pekad = id;
      ritaHus();
    },
    vidByte(l) {
      lyssnare.push(l);
    },
    husprov: () => ({ vald: markerad, tonad, ritat: !!husritat, ruta: husritat }),
    tillstand: () => lagen.map((lage) => ({ stad: lage.stad.id, glugg: lage.visad, forberedd: lage === oppen && redo, ritad: lage === oppen && sedd, avvikelse: lage === oppen ? avvikelse() : null })),
    satt,
  };
}
