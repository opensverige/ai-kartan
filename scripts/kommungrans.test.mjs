import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { GRANS_TOLERANS_M, granserPerKod, meterUtanfor } from './lib/kommungrans.mjs';

// En kvadrat runt (0, 0) med ett hål i mitten.
const ruta = {
  type: 'Polygon',
  coordinates: [
    [[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]],
    [[-0.1, -0.1], [0.1, -0.1], [0.1, 0.1], [-0.1, 0.1], [-0.1, -0.1]],
  ],
};

test('en punkt i kommunen ligger 0 m utanför', () => {
  assert.equal(meterUtanfor([0.5, 0.5], ruta), 0);
});

test('en punkt i ett hål ligger utanför, så långt som till hålets kant', () => {
  assert.ok(Math.abs(meterUtanfor([0, 0], ruta) - 0.1 * 111320) < 50);
});

test('en punkt utanför mäts till närmaste kant', () => {
  assert.ok(Math.abs(meterUtanfor([0, 1.01], ruta) - 0.01 * 111320) < 5);
});

test('MultiPolygon: punkten räknas inne i vilken del som helst', () => {
  const tva = { type: 'MultiPolygon', coordinates: [ruta.coordinates.slice(0, 1), [[[5, 5], [6, 5], [6, 6], [5, 6], [5, 5]]]] };
  assert.equal(meterUtanfor([5.5, 5.5], tva), 0);
});

test('de riktiga gränserna: Sveavägen ligger i Stockholm, långt från Tyresö', () => {
  const geo = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', 'public', 'geo', 'kommuner.geojson'), 'utf8'));
  const granser = granserPerKod(geo);
  const sveavagen = [18.05287, 59.34561];
  assert.equal(meterUtanfor(sveavagen, granser.get('0180')), 0);
  assert.ok(meterUtanfor(sveavagen, granser.get('0138')) > GRANS_TOLERANS_M);
});
