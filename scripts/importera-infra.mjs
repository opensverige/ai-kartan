#!/usr/bin/env node
// Importerar svenska leverantörer från infra.opensverige.se som organisationer av typen infrastruktur.
// Skriver aldrig över befintliga filer utan --force. Flera infra-poster med samma organisationsnummer
// (t.ex. en leverantör med tre tjänster) blir en organisation här.
//
//   node scripts/importera-infra.mjs            # skapar saknade filer
//   node scripts/importera-infra.mjs --force    # skriver om importerade filer
//   node scripts/importera-infra.mjs --torr     # visar bara vad som skulle hända

import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { KATALOG_ORG, lasGeo } from './lib/organisationer.mjs';

const API = 'https://infra.opensverige.se/api/data';
const argv = process.argv.slice(2);
const force = argv.includes('--force');
const torr = argv.includes('--torr');
const IDAG = new Date().toISOString().slice(0, 10);

const KALLTYP = {
  provider_site: 'own_site',
  provider_docs: 'own_docs',
  provider_terms: 'own_docs',
  pricing_page: 'own_site',
  third_party: 'third_party',
  company_register: 'company_register',
  regulator: 'regulator',
  press: 'press',
};

const BESKRIVNING = {
  inference_api: 'Driver inferens-API för språkmodeller på egen infrastruktur i Sverige.',
  compute_gpu: 'Tillhandahåller GPU-kapacitet och beräkningskraft för AI-arbetslaster i Sverige.',
  platform_assistant: 'Bygger en assistentplattform för organisationer, driftad i Sverige.',
  gateway_router: 'Driver en AI-gateway som routar anrop till andras modeller från Sverige.',
};

const ERBJUDER = {
  inference_api: ['infrastruktur', 'produkt'],
  compute_gpu: ['infrastruktur'],
  platform_assistant: ['produkt', 'infrastruktur'],
  gateway_router: ['produkt', 'infrastruktur'],
};

function slug(s) {
  return s
    .toLowerCase()
    .replace(/[åä]/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/é/g, 'e')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function svensk(p) {
  const hq = String(p.ownership?.country_hq?.value ?? '');
  return /sverige|sweden/i.test(hq);
}

function hittaKommun(geo, texter) {
  if (!geo) return null;
  const kandidater = geo.kommuner.slice().sort((a, b) => b.namn.length - a.namn.length);
  for (const t of texter.filter(Boolean)) {
    for (const k of kandidater) {
      const namn = k.namn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`(^|[^\\p{L}])${namn}([^\\p{L}]|$)`, 'iu');
      if (re.test(t)) return k;
    }
  }
  return null;
}

function fakta(value, status, source_url, source_type, verified_at, extra = {}) {
  const f = { value, status, source_url, source_type, verified_at, verified_by: 'manual', ...extra };
  if (!source_url) {
    delete f.source_url;
    delete f.source_type;
  }
  return f;
}

async function huvud() {
  const svar = await fetch(API, { headers: { accept: 'application/json', 'user-agent': 'ai-kartan-import (opensverige.se)' } });
  if (!svar.ok) throw new Error(`Kunde inte hämta ${API}: ${svar.status}`);
  const json = await svar.json();
  const geo = lasGeo();
  const leverantorer = json.providers.filter(svensk);

  // Gruppera på organisationsnummer, annars på namn utan tjänstesuffix.
  const grupper = new Map();
  for (const p of leverantorer) {
    const orgnr = p.ownership?.org_number?.value ?? null;
    const basnamn = p.name.split(' — ')[0].trim();
    const nyckel = orgnr ?? `namn:${basnamn}`;
    if (!grupper.has(nyckel)) grupper.set(nyckel, []);
    grupper.get(nyckel).push(p);
  }

  fs.mkdirSync(KATALOG_ORG, { recursive: true });
  let skapade = 0;
  let hoppade = 0;
  for (const [, poster] of grupper) {
    const p = poster[0];
    const basnamn = p.name.split(' — ')[0].trim();
    const id = slug(basnamn);
    const fil = path.join(KATALOG_ORG, `${id}.yaml`);
    const permalank = `https://infra.opensverige.se/leverantor/${p.id}`;
    if (fs.existsSync(fil) && !force) {
      hoppade++;
      continue;
    }

    const orgnrFakta = p.ownership?.org_number;
    const kategorier = [...new Set(poster.map((x) => x.category))];
    const tjanster = poster.length > 1 ? ` Tjänster på infra: ${poster.map((x) => x.name.split(' — ')[1] ?? x.name).join(', ')}.` : '';
    const beskrivning = kategorier.map((k) => BESKRIVNING[k]).filter(Boolean).join(' ') || 'Levererar AI-infrastruktur i Sverige.';
    const erbjuder = [...new Set(kategorier.flatMap((k) => ERBJUDER[k] ?? ['infrastruktur']))];

    const hqText = p.ownership?.country_hq?.value;
    const kommun = hittaKommun(geo, [hqText, orgnrFakta?.note, p.ownership?.country_hq?.note]);

    const docs = p.api?.docs_url?.value ?? p.pricing?.pricing_page_url?.value ?? p.website;
    const org = {
      id,
      name: fakta(basnamn, 'claimed', p.website, 'own_site', p.record_updated_at ?? IDAG),
      type: fakta('infrastruktur', 'claimed', permalank, 'infra_dataset', IDAG, { note: `Kategori på infra: ${kategorier.join(', ')}.` }),
      website: p.website,
      description: fakta(beskrivning.slice(0, 300), 'claimed', permalank, 'infra_dataset', IDAG, { note: `Importerad från OpenSverige AI-Infra.${tjanster}`.slice(0, 300) }),
      offers: fakta(erbjuder, 'claimed', permalank, 'infra_dataset', IDAG),
      areas: fakta(['generell'], 'claimed', permalank, 'infra_dataset', IDAG),
      evidence: [
        { url: docs, kind: 'produkt', title: 'Tjänstebeskrivning', status: 'claimed', verified_at: IDAG, verified_by: 'manual' },
        { url: permalank, kind: 'case', title: 'Post på OpenSverige AI-Infra med källa per fält', status: 'confirmed', verified_at: IDAG, verified_by: 'manual' },
      ],
      links: { infra_id: p.id },
      record_created_at: IDAG,
      record_updated_at: IDAG,
    };

    if (orgnrFakta?.value) {
      // Kartans regel är strängare än infras: egen webbplats eller egna villkor ger högst egen uppgift.
      const kalltyp = KALLTYP[orgnrFakta.source_type] ?? 'third_party';
      const farBekrafta = ['company_register', 'regulator', 'third_party'].includes(kalltyp);
      const status = orgnrFakta.status === 'confirmed' && farBekrafta ? 'confirmed' : 'claimed';
      org.org_number = fakta(orgnrFakta.value, status, orgnrFakta.source_url, kalltyp, orgnrFakta.verified_at ?? IDAG, {
        note: status === 'claimed' && orgnrFakta.status === 'confirmed' ? 'Via infra.opensverige.se, där uppgiften är bekräftad mot leverantörens egna villkor. Här egen uppgift tills den kontrollerats mot register.' : 'Via infra.opensverige.se.',
      });
    } else {
      org.org_number = fakta(null, 'unknown', null, null, IDAG);
    }

    if (kommun) {
      org.kommun = fakta(kommun.kod, 'claimed', orgnrFakta?.source_url ?? permalank, orgnrFakta?.source_url ? KALLTYP[orgnrFakta.source_type] ?? 'third_party' : 'infra_dataset', IDAG, {
        note: `Ort enligt infra.opensverige.se (${kommun.namn}). Kontrollera mot register.`,
      });
    } else {
      org.kommun = fakta(null, 'unknown', null, null, IDAG);
    }

    const live = p.availability_status?.value;
    if (live) {
      org.active = fakta(live === 'live', 'claimed', p.availability_status.source_url ?? permalank, KALLTYP[p.availability_status.source_type] ?? 'infra_dataset', p.availability_status.verified_at ?? IDAG);
    }

    // Ordna nycklarna som i mallen.
    const ordning = ['id', 'name', 'legal_name', 'type', 'org_number', 'website', 'description', 'offers', 'areas', 'kommun', 'coordinates', 'founded', 'active', 'evidence', 'links', 'self_submitted', 'record_created_at', 'record_updated_at'];
    const sorterad = Object.fromEntries(ordning.filter((k) => k in org).map((k) => [k, org[k]]));
    const yaml = `# Importerad från OpenSverige AI-Infra (${permalank}). Status och källor ärvda därifrån.\n` + YAML.stringify(sorterad, { lineWidth: 0 });
    if (torr) {
      console.log(`skulle skriva ${fil}`);
    } else {
      fs.writeFileSync(fil, yaml, 'utf8');
    }
    skapade++;
  }
  console.log(`${leverantorer.length} svenska leverantörer på infra, ${grupper.size} organisationer. Skapade ${skapade}, hoppade över ${hoppade} befintliga.`);
}

huvud().catch((e) => {
  console.error(e);
  process.exit(1);
});
