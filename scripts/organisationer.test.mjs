// Tester för läsningen av organisationsfiler.
//   npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { faktaIPost, lasOrganisationer, senastVerifierad } from './lib/organisationer.mjs';

test('en symbolisk länk i mappen läses inte som en organisation', () => {
  // En länk kan peka på en fil utanför mappen, som då kan bytas utan att organisationsfilen ändras.
  const katalog = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-kartan-org-'));
  try {
    fs.writeFileSync(path.join(katalog, 'vanlig.yaml'), 'id: vanlig\n');
    fs.writeFileSync(path.join(katalog, 'mal.txt'), 'id: lankad\n');
    fs.symlinkSync(path.join(katalog, 'mal.txt'), path.join(katalog, 'lankad.yaml'));
    fs.symlinkSync(path.join(katalog, 'finns-inte.txt'), path.join(katalog, 'trasig.yaml'));
    const poster = lasOrganisationer(katalog);
    assert.deepEqual(poster.map((p) => [p.fil, p.lank, p.data?.id ?? null]), [
      ['lankad.yaml', true, null],
      ['trasig.yaml', true, null],
      ['vanlig.yaml', false, 'vanlig'],
    ]);
  } finally {
    fs.rmSync(katalog, { recursive: true, force: true });
  }
});

test('varje plats räknas som en egen uppgift', () => {
  // Då gäller statusregler, länkkoll och färskhet för platserna som för andra fält.
  const plats = (kod, datum) => ({ value: { kommun: kod }, status: 'claimed', source_url: 'https://ett.example', source_type: 'own_site', verified_at: datum });
  const data = { kommun: { value: '0180', status: 'confirmed', verified_at: '2026-10-01' }, platser: [plats('1480', '2026-10-02'), plats('1280', '2026-10-03')] };
  assert.deepEqual(faktaIPost(data).map(([namn]) => namn), ['kommun', 'platser[0]', 'platser[1]']);
  assert.equal(senastVerifierad(data), '2026-10-03');
});
