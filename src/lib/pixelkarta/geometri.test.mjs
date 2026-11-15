// Tester för pixelkartans geometri: bildpunkt och plats, närhet, lutning och glugg.
//   npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import { VINKEL, LUTA_FRAN, LUTA_HELT, GLUGG_HELT, skapaProjektion, meterPerPunkt, zoomVid, hemskala, narhet, lutning, glugg, iBild } from './geometri.ts';

// Stockholms kartbild, som den står i kartfilen.
const blad = {
  id: 'norr',
  dzi: 'stockholm-norr.dzi',
  heading: 0,
  origin: { lat: 59.335, lon: 18.055 },
  xMeters: -17408,
  yMeters: 8704,
  groundHeight: 45,
  width: 147456,
  height: 71680,
  island: 'oar/norr.webp',
  edge: 'oar/norr-kant.png',
};
const MPB = 0.25;
const projektion = skapaProjektion(blad, MPB);
const ruta = { bredd: 1000, hojd: 800 };
const mitt = projektion.tillMark(blad.width / 2, blad.height / 2);

test('origin hamnar där kartbildens hörn säger', () => {
  const p = projektion.tillBild(blad.origin.lat, blad.origin.lon);
  // Marken ligger 45 meter över ellipsoiden, och höjd flyttar en punkt uppåt i den sneda bilden.
  assert.ok(Math.abs(p.x - -blad.xMeters / MPB) < 1e-6, `x ${p.x}`);
  assert.ok(Math.abs(p.y - (blad.yMeters - blad.groundHeight / Math.SQRT2) / MPB) < 1e-6, `y ${p.y}`);
});

test('bildpunkt till plats och tillbaka ger samma bildpunkt', () => {
  for (const [x, y] of [[0, 0], [blad.width, 0], [blad.width, blad.height], [0, blad.height], [73000, 36000], [1234.5, 70000.25]]) {
    const m = projektion.tillMark(x, y);
    const p = projektion.tillBild(m.lat, m.lon);
    assert.ok(Math.abs(p.x - x) < 0.01 && Math.abs(p.y - y) < 0.01, `${x},${y} blev ${p.x},${p.y}`);
  }
});

test('norr är uppåt i bilden och öster åt höger', () => {
  const har = projektion.tillBild(59.33, 18.06);
  assert.ok(projektion.tillBild(59.34, 18.06).y < har.y);
  assert.ok(projektion.tillBild(59.33, 18.08).x > har.x);
});

test('en bildpunkt är en fjärdedels meter åt sidan och mer än så på marken i djupled', () => {
  const a = projektion.tillMark(70000, 36000);
  const b = projektion.tillMark(74000, 36000);
  const c = projektion.tillMark(70000, 32000);
  const meterPerGradLon = (Math.PI / 180) * 6378137 * Math.cos((a.lat * Math.PI) / 180);
  const meterPerGradLat = 111_400;
  assert.ok(Math.abs((b.lon - a.lon) * meterPerGradLon - 1000) < 5);
  // 4 000 bildpunkter uppåt är 1 000 meter i bilden och 1 414 meter på marken (45 grader).
  assert.ok(Math.abs((c.lat - a.lat) * meterPerGradLat - 1000 * Math.SQRT2) < 10);
});

test('zoom och skala är varandras omvändning', () => {
  for (const meter of [0.0625, 2.5, 36.6, 900]) assert.ok(Math.abs(meterPerPunkt(59.3, zoomVid(59.3, meter)) - meter) < 1e-9);
});

test('hemskalan är den där hela kartbilden ryms i rutan', () => {
  assert.equal(hemskala(blad, MPB, ruta), Math.max(blad.width / ruta.bredd, blad.height / ruta.hojd) * MPB);
});

const vid = (avstand, plats = mitt) => narhet(blad, projektion, MPB, ruta, { lat: plats.lat, lng: plats.lon, zoom: zoomVid(plats.lat, hemskala(blad, MPB, ruta) * avstand) });

test('närheten mäter skalan i hela staden i bild', () => {
  assert.ok(Math.abs(vid(1).avstand - 1) < 1e-9);
  assert.ok(Math.abs(vid(6).avstand - 6) < 1e-9);
  assert.ok(vid(1).ibild >= 1);
});

test('kartan ligger platt långt ute och i pixelkartans vinkel nära', () => {
  assert.ok(lutning(vid(LUTA_FRAN)) < 1e-9);
  assert.equal(lutning(vid(40)), 0);
  assert.ok(VINKEL - lutning(vid(LUTA_HELT)) < 1e-9);
  assert.equal(lutning(vid(0.01)), VINKEL);
});

test('lutningen växer hela vägen in och tar aldrig ett språng', () => {
  let forra = 0;
  for (let avstand = LUTA_FRAN; avstand >= LUTA_HELT; avstand /= 1.02) {
    const nu = lutning(vid(avstand));
    assert.ok(nu >= forra, `backar vid ${avstand}`);
    assert.ok(nu - forra < 1.5, `språng vid ${avstand}`);
    forra = nu;
  }
});

test('utan staden i bild lutar kartan inte, hur nära den än är', () => {
  // Uppsala, sju mil norrut, inzoomat så att Stockholm är långt utanför rutan.
  const n = narhet(blad, projektion, MPB, ruta, { lat: 59.86, lng: 17.64, zoom: 12 });
  assert.ok(n.ibild <= 0);
  assert.equal(lutning(n), 0);
  assert.equal(glugg(n), 0);
});

test('nära staden ligger kartan kvar i vinkeln så länge någon del av kartbilden är i rutan', () => {
  // Djupt inne, med rutans mitt en tredjedels ruta utanför kartbildens övre kant: staden fyller ännu rutans nedre del.
  const skala = 2; // meter per skärmpunkt
  const kant = projektion.tillMark(blad.width / 2, (-(ruta.hojd / 3) * skala) / MPB);
  const n = narhet(blad, projektion, MPB, ruta, { lat: kant.lat, lng: kant.lon, zoom: zoomVid(kant.lat, skala) });
  assert.ok(n.ibild >= 1, `ibild ${n.ibild}`);
  assert.ok(VINKEL - lutning(n) < 1e-9);
  assert.ok(1 - glugg(n) < 1e-9);
  // En hel ruta utanför är staden ur bild, och kartan ligger platt.
  const borta = projektion.tillMark(blad.width / 2, (-(ruta.hojd * 1.05) * skala) / MPB);
  const m = narhet(blad, projektion, MPB, ruta, { lat: borta.lat, lng: borta.lon, zoom: zoomVid(borta.lat, skala) });
  assert.equal(lutning(m), 0);
  assert.equal(glugg(m), 0);
});

test('långt ute räknas staden bara med rutans mitt nära den', () => {
  // Med staden som en ö i rutans kant lutar kartan knappt: annars vickar den när man zoomar in på en grannort.
  const skala = hemskala(blad, MPB, ruta) * 5;
  const sida = projektion.tillMark(blad.width + (ruta.bredd * 0.45 * skala) / MPB, blad.height / 2);
  const n = narhet(blad, projektion, MPB, ruta, { lat: sida.lat, lng: sida.lon, zoom: zoomVid(sida.lat, skala) });
  assert.ok(lutning(n) < 2, `lutning ${lutning(n)}`);
});

test('gluggen öppnas först när kartan ligger i pixelkartans vinkel', () => {
  assert.ok(glugg(vid(LUTA_HELT)) < 1e-9);
  assert.equal(glugg(vid(LUTA_FRAN)), 0);
  assert.ok(1 - glugg(vid(GLUGG_HELT)) < 1e-9);
  assert.equal(glugg(vid(0.05)), 1);
  const halv = glugg(vid((LUTA_HELT + GLUGG_HELT) / 2));
  assert.ok(halv > 0 && halv < 1);
  // Överallt där gluggen är öppen ligger kartan i vinkeln.
  for (let avstand = 3; avstand > 0.5; avstand /= 1.03) if (glugg(vid(avstand)) > 1e-9) assert.ok(VINKEL - lutning(vid(avstand)) < 1e-6);
});

test('en plats utanför kartbilden ligger inte i bilden', () => {
  assert.ok(iBild(blad, projektion.tillBild(mitt.lat, mitt.lon)));
  assert.ok(!iBild(blad, projektion.tillBild(59.86, 17.64)));
});
