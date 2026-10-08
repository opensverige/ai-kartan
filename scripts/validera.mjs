#!/usr/bin/env node
// Validerar varje organisationsfil mot schemat och kartans regler.
// Körs av CI på varje pull request och före varje bygge. Ett fel stoppar publicering.
//
//   node scripts/validera.mjs            # alla filer
//   node scripts/validera.mjs --json     # maskinläsbar sammanfattning
//   node scripts/validera.mjs data/organisationer/berget-ai.yaml

import fs from 'node:fs';
import path from 'node:path';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import {
  KATALOG_ORG,
  SCHEMA_FIL,
  lasGeo,
  lasJson,
  lasOrganisationer,
  lasTaxonomi,
  faktaIPost,
  senastVerifierad,
  idagISverige,
} from './lib/organisationer.mjs';
import { provaBelaggstyp, utanEgetBelagg } from './lib/belagg.mjs';

const argv = process.argv.slice(2);
const somJson = argv.includes('--json');
const valdaFiler = argv.filter((a) => !a.startsWith('--'));

const schema = lasJson(SCHEMA_FIL);
const tax = lasTaxonomi();
const geo = lasGeo();
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validera = ajv.compile(schema);

const IDAG = idagISverige();
const FORBJUDNA_NYCKLAR =
  /^(kontakt|kontaktperson|contact|e-?post|email|e_mail|mail|telefon|phone|tel|mobil|vd|ceo|cto|cfo|grundare|founder|founders|styrelse|board|anstallda|anställda|employees|headcount|team|personal|personnummer|agare|ägare|owner|owners|ledning|management)$/i;
const EPOST = /[\w.+-]+@[\w-]+\.[\w.-]+/;
// Dagen är 01–31, eller 61–91 i ett samordningsnummer. Juridiska personer har 20 eller mer där månaden står.
const PERSONNUMMER = /(?<!\d)(?:19|20)?\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01]|6[1-9]|[78]\d|9[01])[-+ ]?\d{4}(?!\d)/;
/** Sant för en organisations sida på LinkedIn. Adressen läses som webbläsaren läser den, så att "company/../in/namn" inte slinker igenom. */
function arLinkedinOrganisation(adress) {
  try {
    const u = new URL(adress);
    return /^https?:$/.test(u.protocol) && /(^|\.)linkedin\.com$/.test(u.hostname) && /^\/(company|school|showcase)\/[^/]/.test(u.pathname);
  } catch {
    return false;
  }
}
const MARKNADSORD = /\b(ledande|världsledande|bäst[a]?|nummer ett|revolutionerande|unik[ta]?|banbrytande|marknadsledande)\b/i;
const KALLTYP_FAR_BEKRAFTA = new Set(tax.kalltyper.filter((k) => k.may_confirm).map((k) => k.id));

function* allaNycklarOchStrangar(obj, stig = []) {
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) yield* allaNycklarOchStrangar(obj[i], [...stig, String(i)]);
  } else if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      yield { typ: 'nyckel', nyckel: k, stig: [...stig, k] };
      yield* allaNycklarOchStrangar(v, [...stig, k]);
    }
  } else if (typeof obj === 'string') {
    yield { typ: 'strang', varde: obj, stig };
  }
}

function kontrolleraPost(post) {
  const fel = [];
  const varningar = [];
  const { fil, data } = post;
  const e = (m) => fel.push(m);
  const w = (m) => varningar.push(m);

  if (post.lank) {
    e('Filen är en symbolisk länk. En organisation ska vara en vanlig fil.');
    return { fel, varningar };
  }
  if (post.fel) {
    e(`YAML går inte att läsa: ${post.fel}`);
    return { fel, varningar };
  }
  if (!data || typeof data !== 'object') {
    e('Filen är tom eller inte ett objekt.');
    return { fel, varningar };
  }

  // 1. Schema
  if (!validera(data)) {
    for (const err of validera.errors ?? []) {
      const stig = err.instancePath || '(rot)';
      let text = `${stig} ${err.message}`;
      if (err.keyword === 'additionalProperties') text += `: "${err.params.additionalProperty}"`;
      if (err.keyword === 'enum') text += ` (tillåtna: ${err.params.allowedValues.join(', ')})`;
      if (stig.startsWith('/kommun/value') && err.keyword === 'type') text += ' – kommunkoden måste stå inom citattecken, t.ex. "0180"';
      e(`schema: ${text}`);
    }
  }

  // 2. Filnamn = id
  const forvantat = `${data.id}.yaml`;
  if (fil !== forvantat) e(`Filnamnet måste vara ${forvantat} (id: ${data.id}).`);

  // 3. Status mot källtyp, datum, okända värden
  for (const [namn, fakta] of faktaIPost(data)) {
    if (!fakta || typeof fakta !== 'object') continue;
    const { status, source_type: kalltyp, verified_at: datum, value } = fakta;
    if (status === 'confirmed' && kalltyp && !KALLTYP_FAR_BEKRAFTA.has(kalltyp)) {
      e(`${namn}: status "confirmed" kräver register, myndighet, tredje part, akademisk källa eller infra-datasetet. Källtypen "${kalltyp}" ger högst "claimed".`);
    }
    if (datum && datum > IDAG) e(`${namn}: verified_at ${datum} ligger i framtiden.`);
    if (datum && datum < '2020-01-01') w(`${namn}: verified_at ${datum} är gammalt. Kontrollera om uppgiften är omkontrollerad.`);
    if ((status === 'confirmed' || status === 'claimed' || status === 'planned') && (value === null || value === undefined)) {
      e(`${namn}: status "${status}" men inget värde. Använd status "unknown" när uppgiften saknas.`);
    }
    if (fakta.corroborated_at && datum && fakta.corroborated_at < datum) w(`${namn}: corroborated_at ligger före verified_at.`);
  }

  // 4. Taxonomi
  const typId = data.type?.value;
  const typer = new Set(tax.typer.map((t) => t.id));
  if (typId && !typer.has(typId)) e(`type: okänd organisationstyp "${typId}".`);
  const erbjuder = new Set(tax.erbjuder.map((t) => t.id));
  for (const v of data.offers?.value ?? []) if (!erbjuder.has(v)) e(`offers: okänt värde "${v}".`);
  const omraden = new Set(tax.omraden.map((t) => t.id));
  for (const v of data.areas?.value ?? []) if (!omraden.has(v)) e(`areas: okänt värde "${v}".`);

  // 5. Kommunkod
  const kommunKod = data.kommun?.value;
  if (kommunKod && geo && !geo.kommunPerKod.has(kommunKod)) e(`kommun: koden "${kommunKod}" finns inte i data/geo/kommuner.json.`);
  if (kommunKod && !geo) w('kommun: geodata saknas lokalt, koden kunde inte kontrolleras.');

  // 6. Belägg
  const belagg = Array.isArray(data.evidence) ? data.evidence : [];
  if (belagg.length === 0) e('evidence: minst ett belägg krävs (kriterium 2: har byggt något med AI).');
  const belaggsUrler = new Set();
  for (const b of belagg) {
    if (!b?.url) continue;
    if (belaggsUrler.has(b.url)) w(`evidence: samma länk två gånger: ${b.url}`);
    belaggsUrler.add(b.url);
    if (b.verified_at && b.verified_at > IDAG) e(`evidence: verified_at ${b.verified_at} ligger i framtiden.`);
  }
  const felSort = provaBelaggstyp(data, tax);
  if (felSort) w(felSort);

  // 7. Personuppgifter
  if (typId === 'enskild_firma') {
    if (data.self_submitted !== true) e('enskild_firma: posten får bara skapas av personen själv. Sätt self_submitted: true.');
    if (data.coordinates) e('enskild_firma: exakta koordinater är inte tillåtna. Ta bort coordinates.');
  }
  if (typeof data.links?.linkedin === 'string' && !arLinkedinOrganisation(data.links.linkedin)) {
    e('links.linkedin: ska vara organisationens sida (https://www.linkedin.com/company/…), aldrig en personprofil.');
  }
  for (const traff of allaNycklarOchStrangar(data)) {
    if (traff.typ === 'nyckel' && FORBJUDNA_NYCKLAR.test(traff.nyckel)) {
      e(`Personuppgifter: fältet "${traff.stig.join('.')}" finns inte i schemat och får inte läggas till.`);
    }
    if (traff.typ === 'strang') {
      if (EPOST.test(traff.varde)) e(`Personuppgifter: e-postadress i ${traff.stig.join('.')}. Ta bort den.`);
      if (!traff.stig.includes('source_url') && !traff.stig.includes('url') && !traff.stig.includes('website') && PERSONNUMMER.test(traff.varde)) {
        e(`Personuppgifter: något som ser ut som ett personnummer i ${traff.stig.join('.')}. Ta bort det.`);
      }
    }
  }

  // 8. Språk och ton
  const beskrivning = data.description?.value ?? '';
  if (MARKNADSORD.test(beskrivning)) w(`description: undvik värdeord (${beskrivning.match(MARKNADSORD)?.[0]}). Beskriv vad som byggs, inte hur bra det är.`);

  // 9. Datum på posten
  if (data.record_updated_at && data.record_created_at && data.record_updated_at < data.record_created_at) e('record_updated_at ligger före record_created_at.');
  const senast = senastVerifierad(data);
  if (senast && data.record_updated_at && senast > data.record_updated_at) w(`record_updated_at (${data.record_updated_at}) är äldre än senaste verifiering (${senast}). Uppdatera datumet.`);

  // 10. Nedlagd kräver belägg: värdet visas som "nedlagd eller avregistrerad" på organisationens sida.
  if (data.active?.value === false && data.active?.status !== 'confirmed') {
    w('active: false visas som "nedlagd eller avregistrerad". Belägg det mot register eller ta bort fältet.');
  }

  return { fel, varningar };
}

/** Webbplatsen i en form som går att jämföra: värd utan www och sökväg utan avslutande snedstreck. */
function webbnyckel(adress) {
  try {
    const u = new URL(adress);
    return `${u.hostname.toLowerCase().replace(/^www\./, '')}${u.pathname.replace(/\/+$/, '').toLowerCase()}${u.search}`;
  } catch {
    return String(adress).replace(/\/+$/, '').toLowerCase();
  }
}

/** Vilka filer som delar på varje värde. Dubbletter söks bland alla poster, även när bara några valideras. */
function filerPer(poster, nyckel) {
  const ut = new Map();
  for (const post of poster) {
    const k = post.data ? nyckel(post.data) : null;
    if (k) ut.set(k, [...(ut.get(k) ?? []), post.fil]);
  }
  return ut;
}

function huvud() {
  let poster = lasOrganisationer();
  // Jämförs mot alla poster, även när bara några filer valideras.
  const utanEget = utanEgetBelagg(poster.filter((p) => p.data).map((p) => p.data));
  const idn = filerPer(poster, (d) => (typeof d.id === 'string' ? d.id : null));
  const webbar = filerPer(poster, (d) => (typeof d.website === 'string' && d.website ? webbnyckel(d.website) : null));
  if (valdaFiler.length) {
    const valda = new Set(valdaFiler.map((f) => path.basename(f)));
    poster = poster.filter((p) => valda.has(p.fil));
  }
  if (!fs.existsSync(KATALOG_ORG)) {
    console.error(`Katalogen saknas: ${KATALOG_ORG}`);
    process.exit(1);
  }

  const resultat = [];
  let antalFel = 0;
  let antalVarningar = 0;

  for (const post of poster) {
    const r = kontrolleraPost(post);
    const id = post.data?.id;
    const sammaId = (typeof id === 'string' ? (idn.get(id) ?? []) : []).filter((f) => f !== post.fil);
    if (sammaId.length) r.fel.push(`id "${id}" används redan i ${sammaId[0]}.`);
    if (utanEget.has(id)) {
      r.varningar.push(`evidence: inget eget belägg. Alla länkar används också av ${utanEget.get(id).join(', ')}. Lägg till en länk som visar organisationens eget arbete.`);
    }
    const webb = typeof post.data?.website === 'string' && post.data.website ? webbnyckel(post.data.website) : null;
    const sammaWebb = (webb ? (webbar.get(webb) ?? []) : []).filter((f) => f !== post.fil);
    if (sammaWebb.length) r.fel.push(`website ${webb} används redan i ${sammaWebb[0]}. En organisation, en post.`);
    antalFel += r.fel.length;
    antalVarningar += r.varningar.length;
    resultat.push({ fil: post.fil, id, ...r });
  }

  const perTyp = {};
  const perStatus = { confirmed: 0, claimed: 0, planned: 0, unknown: 0, not_applicable: 0 };
  let medBekraftat = 0;
  for (const post of poster) {
    if (!post.data) continue;
    const t = post.data.type?.value ?? 'okänd';
    perTyp[t] = (perTyp[t] ?? 0) + 1;
    let harBekraftat = false;
    for (const [, f] of faktaIPost(post.data)) {
      if (f?.status in perStatus) perStatus[f.status]++;
      if (f?.status === 'confirmed') harBekraftat = true;
    }
    if (harBekraftat) medBekraftat++;
  }

  const sammanfattning = {
    datum: IDAG,
    antal_poster: poster.length,
    antal_fel: antalFel,
    antal_varningar: antalVarningar,
    per_typ: perTyp,
    per_status: perStatus,
    poster_med_minst_ett_bekraftat_falt: medBekraftat,
    andel_med_bekraftat: poster.length ? +((medBekraftat / poster.length) * 100).toFixed(1) : 0,
  };

  if (somJson) {
    console.log(JSON.stringify({ sammanfattning, resultat: resultat.filter((r) => r.fel.length || r.varningar.length) }, null, 2));
  } else {
    for (const r of resultat) {
      if (!r.fel.length && !r.varningar.length) continue;
      console.log(`\n${r.fil}`);
      for (const m of r.fel) console.log(`  FEL  ${m}`);
      for (const m of r.varningar) console.log(`  obs  ${m}`);
    }
    console.log(
      `\n${poster.length} poster, ${antalFel} fel, ${antalVarningar} varningar. ` +
        `Bekräftat minst ett fält: ${medBekraftat} (${sammanfattning.andel_med_bekraftat} %).`,
    );
  }
  process.exit(antalFel ? 1 : 0);
}

huvud();
