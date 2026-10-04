#!/usr/bin/env node
// Gör ett ifyllt ärendeformulär ("Lägg till en organisation") till en YAML-fil.
// Körs av .github/workflows/ny-organisation.yml, men går också att köra lokalt:
//
//   ISSUE_BODY="$(cat arende.md)" node scripts/ny-organisation.mjs --fran-arende
//   node scripts/ny-organisation.mjs --fil exempel.md
//
// Allt som kommer från formuläret märks som egen uppgift (claimed, self_submitted) med dagens datum.

import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { KATALOG_ORG, lasGeo } from './lib/organisationer.mjs';

const argv = process.argv.slice(2);
const IDAG = new Date().toISOString().slice(0, 10);

let kropp = process.env.ISSUE_BODY ?? '';
const filIx = argv.indexOf('--fil');
if (filIx >= 0) kropp = fs.readFileSync(argv[filIx + 1], 'utf8');
if (!kropp.trim()) {
  console.error('Ingen ärendetext. Sätt ISSUE_BODY eller använd --fil.');
  process.exit(1);
}

/** Delar upp GitHubs formulärutdata "### Etikett\n\nvärde" i ett objekt. */
function parsa(text) {
  const ut = {};
  const delar = text.split(/^### /m).slice(1);
  for (const del of delar) {
    const [rubrik, ...rest] = del.split('\n');
    const varde = rest.join('\n').trim();
    ut[rubrik.trim()] = varde === '_No response_' ? '' : varde;
  }
  return ut;
}
function ikryssade(text) {
  return (text || '')
    .split('\n')
    .filter((r) => /^- \[[xX]\]/.test(r))
    .map((r) => r.replace(/^- \[[xX]\]\s*/, '').split(/\s+[–-]\s+/)[0].trim());
}
function slug(s) {
  return s
    .toLowerCase()
    .replace(/[åä]/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/[éè]/g, 'e')
    .replace(/ü/g, 'u')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}
function normaliseraUrl(u) {
  u = (u || '').trim();
  if (!u) return '';
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  return u.replace(/\/+$/, '');
}

const f = parsa(kropp);
const namn = (f['Namn'] || '').trim();
const webbplats = normaliseraUrl(f['Webbplats']);
const typ = (f['Organisationstyp'] || '').trim();
const orgnr = (f['Organisationsnummer'] || '').trim();
const kommunNamn = (f['Kommun där organisationen har sitt säte'] || '').trim();
const beskrivning = (f['Vad bygger ni med AI?'] || '').replace(/\s+/g, ' ').trim();
const erbjuder = ikryssade(f['Vad erbjuder ni?']);
const omraden = ikryssade(f['Områden']);
const belaggUrl = normaliseraUrl(f['Belägg – länk till något ni byggt med AI']);
const belaggTyp = (f['Vad är belägget?'] || 'produkt').trim();
const belaggTitel = (f['Rubrik på belägget'] || '').trim();
const grundat = parseInt((f['Grundat år'] || '').trim(), 10);
const github = normaliseraUrl(f['GitHub-organisation (valfritt)']);
const huggingface = normaliseraUrl(f['Hugging Face (valfritt)']);
const linkedin = normaliseraUrl(f['LinkedIn-sida för organisationen (valfritt, aldrig en personprofil)']);
const kalla = normaliseraUrl(f['Sida där uppgifterna står']) || webbplats;

const fel = [];
if (!namn) fel.push('Namn saknas.');
if (!webbplats) fel.push('Webbplats saknas.');
if (!typ) fel.push('Organisationstyp saknas.');
if (!beskrivning) fel.push('Beskrivning saknas.');
if (!belaggUrl) fel.push('Belägg saknas.');
if (fel.length) {
  console.error(fel.join('\n'));
  process.exit(1);
}

const geo = lasGeo();
const kommun = geo?.kommuner.find((k) => k.namn.toLowerCase() === kommunNamn.toLowerCase().replace(/\s+kommun$/i, '').trim()) ?? null;

const egen = (value, extra = {}) => ({ value, status: 'claimed', source_url: kalla, source_type: 'self_submitted', verified_at: IDAG, verified_by: 'self', ...extra });

const id = slug(namn);
const org = {
  id,
  name: egen(namn, { source_url: webbplats }),
  type: egen(typ),
  website: webbplats,
  description: egen(beskrivning.slice(0, 300)),
  offers: egen(erbjuder.length ? erbjuder : ['produkt']),
  areas: egen(omraden.length ? omraden : ['generell']),
  evidence: [{ url: belaggUrl, kind: belaggTyp, ...(belaggTitel ? { title: belaggTitel } : {}), status: 'claimed', verified_at: IDAG, verified_by: 'self' }],
  self_submitted: true,
  record_created_at: IDAG,
  record_updated_at: IDAG,
};
if (orgnr && typ !== 'enskild_firma') org.org_number = egen(orgnr);
org.kommun = kommun
  ? egen(kommun.kod, { note: `Kommun angiven av organisationen: ${kommunNamn}.` })
  : { value: null, status: 'unknown', verified_at: IDAG, note: kommunNamn ? `Angiven kommun "${kommunNamn}" kunde inte matchas mot kommunlistan.` : 'Ingen kommun angiven.' };
if (Number.isInteger(grundat) && grundat > 1400) org.founded = egen(grundat);
const links = {};
if (github) links.github = github;
if (huggingface) links.huggingface = huggingface;
if (linkedin) links.linkedin = linkedin;
if (Object.keys(links).length) org.links = links;

const ordning = ['id', 'name', 'legal_name', 'type', 'org_number', 'website', 'description', 'offers', 'areas', 'kommun', 'coordinates', 'founded', 'active', 'evidence', 'links', 'self_submitted', 'record_created_at', 'record_updated_at'];
const sorterad = Object.fromEntries(ordning.filter((k) => k in org).map((k) => [k, org[k]]));

fs.mkdirSync(KATALOG_ORG, { recursive: true });
const fil = path.join(KATALOG_ORG, `${id}.yaml`);
const arende = process.env.ISSUE_NUMBER ? ` (ärende #${process.env.ISSUE_NUMBER})` : '';
fs.writeFileSync(fil, `# Inskickad av organisationen själv${arende}. Alla uppgifter är egen uppgift tills de bekräftats.\n` + YAML.stringify(sorterad, { lineWidth: 0 }), 'utf8');
console.log(`Skrev ${fil}`);

if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `fil=${path.relative(process.cwd(), fil).replace(/\\/g, '/')}\nid=${id}\nnamn=${namn.replace(/\n/g, ' ')}\n`);
}
