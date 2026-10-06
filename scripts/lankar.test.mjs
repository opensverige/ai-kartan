// Tester för hur länkkontrollen bedömer ett svar.
//   npm test
// Körs med Nodes inbyggda testkörare, utan beroenden.

import test from 'node:test';
import assert from 'node:assert/strict';
import { bedomLank } from './lib/lankar.mjs';

test('en sida som svarar är ok, även när den omdirigerar eller nekar robotar', () => {
  for (const status of [200, 204, 301, 308, 403, 429]) assert.equal(bedomLank({ status }), 'ok', String(status));
});

test('en sida som servern säger är borta är död', () => {
  for (const status of [404, 410, 401]) assert.equal(bedomLank({ status }), 'dod', String(status));
});

test('en domän som inte finns i DNS är död', () => {
  assert.equal(bedomLank({ status: 0, fel: 'ENOTFOUND' }), 'dod');
});

test('ett serverfel eller ett nätfel betyder bara att sidan inte gick att nå härifrån', () => {
  assert.equal(bedomLank({ status: 503 }), 'onabar');
  for (const fel of ['timeout', 'ECONNRESET', 'UND_ERR_CONNECT_TIMEOUT', 'fetch failed', 'CERT_HAS_EXPIRED']) {
    assert.equal(bedomLank({ status: 0, fel }), 'onabar', fel);
  }
});
