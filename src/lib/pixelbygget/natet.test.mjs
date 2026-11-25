// Tester för rutnätet över Sverige, som byggkartan ritar. Talen är de rut-tjänsten svarar.
//   npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import { bladVid, bladMedId, bladIRutan, agerRutan, rutansHorn, bladFranRad, rutorAttRita } from './natet.ts';

test('Helsingborg får samma blad som tjänsten ger', () => {
  assert.deepEqual(bladVid(56.0465, 12.6945), {
    id: 'se-n5602-e1262',
    origin_lat: 56.025,
    origin_lon: 12.625,
    cols: 61,
    rows: 47,
    x_meters: -7808,
    y_meters: 6016,
  });
});

test('Eslöv får sitt blad, och utanför Sverige finns inget', () => {
  assert.equal(bladVid(55.8375, 13.3036).id, 'se-n5587-e1337');
  assert.equal(bladVid(59.9139, 10.7522), null);
  assert.equal(bladVid(Number.NaN, 12), null);
});

test('ett blads namn ger bladet tillbaka, och ett påhittat namn ingenting', () => {
  assert.deepEqual(bladMedId('se-n5602-e1262'), bladVid(56.0465, 12.6945));
  assert.equal(bladMedId('se-n5601-e1263'), null);
  assert.equal(bladMedId('stockholm-norr'), null);
});

test('rutan vid Stortorget ägs av sitt blad', () => {
  assert.equal(agerRutan(bladVid(56.0465, 12.6945), 47, 16), true);
  assert.equal(agerRutan(bladVid(56.0465, 12.6945), -1, 0), false);
  assert.equal(agerRutan(bladVid(56.0465, 12.6945), 61, 0), false);
});

test('rutans hörn ligger runt Stortorget', () => {
  const blad = bladFranRad(bladVid(56.0465, 12.6945));
  const horn = rutansHorn(blad, 47, 16);
  assert.equal(horn.length, 5); // en sluten ring
  const lon = horn.slice(0, 4).map((h) => h[0]);
  const lat = horn.slice(0, 4).map((h) => h[1]);
  assert.ok(Math.min(...lon) < 12.6945 && Math.max(...lon) > 12.6945, `lon ${lon}`);
  assert.ok(Math.min(...lat) < 56.0475 && Math.max(...lat) > 56.0445, `lat ${lat}`);
  // En ruta är 256 meter i öst-väst.
  const bredd = (Math.max(...lon) - Math.min(...lon)) * 111320 * Math.cos((56.046 * Math.PI) / 180);
  assert.ok(Math.abs(bredd - 256) < 3, `bredd ${bredd}`);
});

test('en lagrad rad används som den står, med sin markhöjd', () => {
  const rad = { id: 'se-n5602-e1262', cols: 61, rows: 47, origin_lat: 56.025, origin_lon: 12.625, x_meters: -7808, y_meters: 6037.213203435596, ground_height: 30 };
  const lagrad = bladFranRad(rad);
  const raknad = bladFranRad(bladVid(56.0465, 12.6945));
  // Höjden flyttar bilden, men rutan står på samma mark: hörnen skiljer bara några meter.
  const a = rutansHorn(lagrad, 47, 16)[0];
  const b = rutansHorn(raknad, 47, 16)[0];
  assert.ok(Math.abs(a[1] - b[1]) * 111320 < 40, `${a} ${b}`);
});

test('bladen i en ruta på kartan är de som rör den', () => {
  const runt = bladIRutan({ west: 12.6, east: 12.8, south: 56.0, north: 56.1 });
  const id = runt.map((b) => b.id).sort();
  assert.ok(id.includes('se-n5602-e1262'), id.join(' '));
  assert.ok(id.length >= 2 && id.length <= 6, id.join(' '));
  // Hela Sverige på en gång ger inga blad: det är för långt ut för ett rutnät.
  assert.deepEqual(bladIRutan({ west: 10, east: 25, south: 55, north: 69 }), []);
});

test('rutorna att rita hoppar över mark som en stad ritad för hand äger', () => {
  const stad = { id: 'hand', cols: 4, rows: 4, origin_lat: 56.0465, origin_lon: 12.6945, x_meters: -512, y_meters: 512, ground_height: 0 };
  const blad = bladFranRad(bladVid(56.0465, 12.6945));
  const ritas = rutorAttRita(blad, [bladFranRad(stad)], { west: 12.68, east: 12.71, south: 56.04, north: 56.055 });
  assert.ok(ritas.length > 0);
  assert.equal(ritas.some((r) => r.kol === 47 && r.rad === 16), false);
});

test('ett brett fönster där rutnätet först syns får alla sina blad', () => {
  // Ett fönster 2560 punkter brett, där en ruta är 14 punkter: tolv blad i bild.
  const runt = bladIRutan({ west: 12.6, east: 13.35, south: 55.75, north: 56.0 });
  assert.equal(runt.length, 12);
});
