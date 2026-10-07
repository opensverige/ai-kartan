#!/usr/bin/env node
// Gör det långa ärendeformuläret ("Lägg in hela posten själv") till en YAML-fil.
// Det korta formuläret, tre fält, tas emot av scripts/tips.mjs.
// Körs av .github/workflows/ny-organisation.yml, men går också att köra lokalt:
//
//   ISSUE_BODY="$(cat arende.md)" node scripts/ny-organisation.mjs --fran-arende
//   node scripts/ny-organisation.mjs --fil exempel.md
//   … --rensad kropp.md   ärendetexten utan personnummer, om något togs bort
//   … --fel fel.md        det som ska svaras i ärendet när formuläret inte kan bli en post
//
// Allt som kommer från formuläret märks som egen uppgift (claimed, self_submitted) med dagens datum.

import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { KATALOG_ORG, idagISverige, lasGeo, lasOrganisationer } from './lib/organisationer.mjs';
import { arendetext, parsa, ikryssade, normaliseraUrl, personnummerI, utanNummer, arNummer } from './lib/arende.mjs';
import { hittaDubblett } from './lib/tips.mjs';

const argv = process.argv.slice(2);
const arg = (namn) => {
  const i = argv.indexOf(namn);
  return i >= 0 ? argv[i + 1] : null;
};
const IDAG = idagISverige();
const SAJT = (process.env.SITE_URL || 'https://karta.opensverige.se').replace(/\/$/, '');

let kropp = arendetext();
if (arg('--fil')) kropp = fs.readFileSync(arg('--fil'), 'utf8');
if (!kropp.trim()) {
  console.error('Ingen ärendetext. Använd --fil, eller sätt ISSUE_BODY.');
  process.exit(1);
}

const tillFlodet = (rader) => process.env.GITHUB_OUTPUT && fs.appendFileSync(process.env.GITHUB_OUTPUT, `${rader.join('\n')}\n`);

/**
 * Avbryter med ett svar som flödet skriver i ärendet. Svaret upprepar aldrig fritext ur ärendet:
 * det ligger publikt och ska inte kunna användas för att nämna folk eller sprida länkar.
 */
function avbryt(svar) {
  console.error(svar);
  if (arg('--fel')) fs.writeFileSync(arg('--fel'), `${svar}\n`, 'utf8');
  process.exit(1);
}

// Först av allt: ett personnummer ska inte stå kvar i ett publikt ärende, och aldrig hamna i en fil.
// En enskild firmas organisationsnummer är personens personnummer, hur det än ser ut.
{
  const f = parsa(kropp);
  const nummerfalt = (f['Organisationsnummer'] || '').trim();
  const bort = [...personnummerI(f['Namn']), ...personnummerI(nummerfalt)];
  if ((f['Organisationstyp'] || '').trim() === 'enskild_firma' && arNummer(nummerfalt)) bort.push(nummerfalt);
  const rensad = utanNummer(kropp, bort);
  if (rensad && arg('--rensad')) fs.writeFileSync(arg('--rensad'), rensad, 'utf8');
  tillFlodet([`rensad=${Boolean(rensad)}`]);
  // Efter en rensning skapas ingen post. Ett personnummer som organisationsnummer betyder enskild
  // firma, och ett namn med ett nummer i ska skrivas om av den som skickade in det.
  if (rensad) {
    const tillGranskaren = 'Till den som granskar: radera även den tidigare versionen ur ärendets redigeringshistorik.';
    avbryt(
      personnummerI(f['Namn']).length
        ? `Namnet innehöll ett nummer som såg ut som ett personnummer. Det har tagits bort ur ärendet. Redigera ärendet och skriv namnet utan nummer.\n\n${tillGranskaren}`
        : `Ett nummer som såg ut som ett personnummer har tagits bort ur ärendet. För en enskild firma är organisationsnumret ett personnummer och ska aldrig skrivas här. Enskilda firmor tar vi inte emot än. Gäller det ett bolag: redigera ärendet och skriv bolagets organisationsnummer, eller lämna fältet tomt.\n\n${tillGranskaren}`,
    );
  }
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

const f = parsa(kropp);
const namn = (f['Namn'] || '').trim();
const webbplats = normaliseraUrl(f['Webbplats']);
const typ = (f['Organisationstyp'] || '').trim();
// Tio siffror utan bindestreck skrivs om till den form schemat vill ha.
const orgnr = (f['Organisationsnummer'] || '').trim().replace(/^(\d{6})(\d{4})$/, '$1-$2');
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
if (fel.length) avbryt(fel.map((rad) => `- ${rad}`).join('\n'));

// Folk skriver kommunen som den heter i tal: "Stockholms kommun", "Göteborgs Stad".
const geo = lasGeo();
const utanSort = kommunNamn.toLowerCase().replace(/\s+(kommun|stad)$/, '').trim();
const kommunMed = (namn) => geo?.kommuner.find((k) => k.namn.toLowerCase() === namn) ?? null;
const kommun = kommunMed(utanSort) ?? (utanSort.endsWith('s') ? kommunMed(utanSort.slice(0, -1)) : null);

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
// Formuläret är för nya organisationer. Utan spärren kunde vem som helst lägga fram en
// överskrivning av en befintlig post som om den vore ett nytillskott.
const rattaDar = (finnsId) => `${SAJT}/organisation/${finnsId}\n\nStämmer något inte där? Använd knappen Rätta via GitHub längst ned på den sidan. Gäller det en annan organisation, skriv det i en kommentar här så tittar vi.`;
if (fs.existsSync(fil)) avbryt(`Det finns redan en post med id \`${id}\` på kartan: ${rattaDar(id)}`);
// Samma organisation under ett annat namn känns igen på webbplatsen, som i det korta formuläret.
const befintliga = lasOrganisationer()
  .filter((p) => p.data)
  .map((p) => ({ id: p.data.id, namn: p.data.name?.value ?? p.data.id, webbplats: p.data.website }));
const dubblett = hittaDubblett(namn, webbplats, befintliga);
if (dubblett && /^[a-z0-9-]+$/.test(String(dubblett.id))) avbryt(`Organisationen verkar redan finnas på kartan: ${rattaDar(dubblett.id)}`);
const arende = process.env.ISSUE_NUMBER ? ` (ärende #${process.env.ISSUE_NUMBER})` : '';
fs.writeFileSync(fil, `# Inskickad av organisationen själv${arende}. Alla uppgifter är egen uppgift tills de bekräftats.\n` + YAML.stringify(sorterad, { lineWidth: 0 }), 'utf8');
console.log(`Skrev ${fil}`);

tillFlodet([`fil=${path.relative(process.cwd(), fil).replace(/\\/g, '/')}`, `id=${id}`, `namn=${namn.replace(/[\r\n\[\]]/g, ' ')}`]);
