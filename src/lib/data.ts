// Laddar all data en gång per bygge och härleder det sidorna behöver.
// Källan är alltid data/organisationer/*.yaml. Ingen databas.

import fs from 'node:fs';
import path from 'node:path';
import { ROT, lasOrganisationer, lasTaxonomi, lasGeo, harled } from '../../scripts/lib/organisationer.mjs';
import { platserPaLand } from '../../scripts/lib/landplatser.mjs';
import { hittaTypikoner } from './typikoner';

export type Status = 'confirmed' | 'claimed' | 'planned' | 'unknown' | 'not_applicable';
export type Typ = 'bolag' | 'enskild_firma' | 'myndighet' | 'kommun_region' | 'larosate' | 'community' | 'finansiar' | 'infrastruktur';

export interface Fakta<T = unknown> {
  value: T;
  status: Status;
  source_url?: string;
  source_type?: string;
  verified_at: string;
  verified_by?: string;
  note?: string;
  corroborated_at?: string;
  corroborated_by?: string;
}

export interface Belagg {
  url: string;
  kind: string;
  title?: string;
  status?: 'confirmed' | 'claimed';
  verified_at: string;
  verified_by?: string;
  note?: string;
}

export interface OrgData {
  id: string;
  name: Fakta<string>;
  legal_name?: Fakta<string | null>;
  type: Fakta<Typ>;
  org_number?: Fakta<string | null>;
  website: string;
  description: Fakta<string>;
  offers: Fakta<string[]>;
  areas: Fakta<string[]>;
  kommun: Fakta<string | null>;
  coordinates?: Fakta<{ lat: number; lng: number }>;
  founded?: Fakta<number | null>;
  active?: Fakta<boolean | null>;
  evidence: Belagg[];
  links?: { github?: string; huggingface?: string; linkedin?: string; wikidata?: string; infra_id?: string };
  self_submitted?: boolean;
  record_created_at: string;
  record_updated_at: string;
}

export interface Harlett {
  kommun_namn: string | null;
  kommun_slug: string | null;
  lan_kod: string | null;
  lan_namn: string | null;
  lan_slug: string | null;
  position: { lat: number; lng: number } | null;
  position_typ: 'exakt' | 'kommun' | null;
  senast_verifierad: string | null;
  dagar_sedan_kontroll: number | null;
  antal_bekraftade: number;
  antal_fakta: number;
}

export interface Org extends OrgData {
  h: Harlett;
}

export interface Etikett {
  id: string;
  label: string;
  plural?: string;
  short?: string;
  description?: string;
  color?: string;
  may_confirm?: boolean;
  /** Bara typer: sorters belägg som räknas för kriterium 2. */
  belagg?: string[];
}

export interface Taxonomi {
  typer: Etikett[];
  erbjuder: Etikett[];
  omraden: Etikett[];
  status: Etikett[];
  kalltyper: Etikett[];
  belaggstyper: Etikett[];
}

export interface Kommun {
  kod: string;
  namn: string;
  slug: string;
  lan_kod: string;
  lan_namn: string;
  lat: number;
  lng: number;
  /** Varifrån punkten kommer: wikidata (tätortens mittpunkt) eller centroid (polygonens). */
  punkt_kalla?: 'wikidata' | 'centroid';
}
export interface Lan {
  kod: string;
  namn: string;
  slug: string;
  lat: number;
  lng: number;
  punkt_kalla?: 'wikidata' | 'centroid';
}

export interface AndringsRad {
  datum: string;
  commit: string;
  id: string;
  namn: string;
  falt: string;
  andring: string;
  gammalt: unknown;
  nytt: unknown;
  status: string | null;
  gammal_status?: string | null;
  kalla: string | null;
}

export interface Plats {
  typ: 'kommun' | 'lan';
  kod: string;
  namn: string;
  slug: string;
  lat: number;
  lng: number;
  organisationer: Org[];
  lan_kod?: string;
  lan_namn?: string;
  lan_slug?: string;
}

export interface Dataset {
  organisationer: Org[];
  perId: Map<string, Org>;
  taxonomi: Taxonomi;
  etikett: Record<keyof Taxonomi, Map<string, Etikett>>;
  kommuner: Kommun[];
  lan: Lan[];
  platser: { kommuner: Plats[]; lan: Plats[] };
  andringar: { generated_at: string | null; senaste_andring: string | null; rader: AndringsRad[] };
  statistik: {
    antal: number;
    per_typ: Record<string, number>;
    per_erbjuder: Record<string, number>;
    per_omrade: Record<string, number>;
    per_lan: Record<string, number>;
    med_bekraftat: number;
    andel_med_bekraftat: number;
    fakta_per_status: Record<Status, number>;
    senast_verifierad: string | null;
    aldsta_kontroll_dagar: number | null;
    antal_over_180_dagar: number;
    utan_plats: number;
  };
  byggd: string;
}

let cache: Dataset | null = null;

export function hamtaData(): Dataset {
  if (cache) return cache;
  const taxonomi = lasTaxonomi() as Taxonomi;
  const geo = lasGeo();
  const poster = lasOrganisationer();
  const trasiga = poster.filter((p) => p.fel || !p.data);
  if (trasiga.length) {
    throw new Error(`Ogiltiga datafiler: ${trasiga.map((p) => p.fil).join(', ')}. Kör npm run validera.`);
  }
  const jamfor = new Intl.Collator('sv');
  // Platserna inom en kommun delas ut på en gång: varje organisation får en egen ruta på land.
  const paLand = platserPaLand(poster.map((p) => p.data), geo);
  const organisationer: Org[] = poster
    .map((p) => ({ ...(p.data as OrgData), h: harled(p.data, geo, paLand) as Harlett }))
    .sort((a, b) => jamfor.compare(a.name.value, b.name.value));

  const etikett = Object.fromEntries(
    (Object.keys(taxonomi) as (keyof Taxonomi)[]).map((k) => [k, new Map(taxonomi[k].map((e) => [e.id, e]))]),
  ) as Record<keyof Taxonomi, Map<string, Etikett>>;

  const kommuner: Kommun[] = geo?.kommuner ?? [];
  const lan: Lan[] = geo?.lan ?? [];

  const perKommun = new Map<string, Org[]>();
  const perLan = new Map<string, Org[]>();
  for (const o of organisationer) {
    const k = o.kommun?.value;
    if (k) {
      if (!perKommun.has(k)) perKommun.set(k, []);
      perKommun.get(k)!.push(o);
      const l = k.slice(0, 2);
      if (!perLan.has(l)) perLan.set(l, []);
      perLan.get(l)!.push(o);
    }
  }
  const platser = {
    kommuner: kommuner
      .filter((k) => perKommun.has(k.kod))
      .map<Plats>((k) => ({
        typ: 'kommun',
        kod: k.kod,
        namn: k.namn,
        slug: k.slug,
        lat: k.lat,
        lng: k.lng,
        lan_kod: k.lan_kod,
        lan_namn: k.lan_namn,
        lan_slug: lan.find((l) => l.kod === k.lan_kod)?.slug,
        organisationer: perKommun.get(k.kod)!,
      }))
      .sort((a, b) => b.organisationer.length - a.organisationer.length || jamfor.compare(a.namn, b.namn)),
    lan: lan
      .filter((l) => perLan.has(l.kod))
      .map<Plats>((l) => ({ typ: 'lan', kod: l.kod, namn: l.namn, slug: l.slug, lat: l.lat, lng: l.lng, organisationer: perLan.get(l.kod)! }))
      .sort((a, b) => b.organisationer.length - a.organisationer.length || jamfor.compare(a.namn, b.namn)),
  };

  const loggFil = path.join(ROT, 'history', 'changelog.json');
  const andringar = fs.existsSync(loggFil)
    ? (JSON.parse(fs.readFileSync(loggFil, 'utf8')) as Dataset['andringar'])
    : { generated_at: null, senaste_andring: null, rader: [] };

  const rakna = (nycklar: (o: Org) => string[]) => {
    const ut: Record<string, number> = {};
    for (const o of organisationer) for (const n of nycklar(o)) ut[n] = (ut[n] ?? 0) + 1;
    return ut;
  };
  const faktaPerStatus: Record<Status, number> = { confirmed: 0, claimed: 0, planned: 0, unknown: 0, not_applicable: 0 };
  for (const o of organisationer) {
    for (const f of allaFakta(o)) faktaPerStatus[f.fakta.status]++;
  }
  const medBekraftat = organisationer.filter((o) => o.h.antal_bekraftade > 0).length;
  const dagar = organisationer.map((o) => o.h.dagar_sedan_kontroll).filter((d): d is number => d !== null);
  const senast = organisationer.map((o) => o.h.senast_verifierad).filter((d): d is string => !!d).sort().at(-1) ?? null;

  cache = {
    organisationer,
    perId: new Map(organisationer.map((o) => [o.id, o])),
    taxonomi,
    etikett,
    kommuner,
    lan,
    platser,
    andringar,
    statistik: {
      antal: organisationer.length,
      per_typ: rakna((o) => [o.type.value]),
      per_erbjuder: rakna((o) => o.offers.value),
      per_omrade: rakna((o) => o.areas.value),
      per_lan: rakna((o) => (o.h.lan_kod ? [o.h.lan_kod] : [])),
      med_bekraftat: medBekraftat,
      andel_med_bekraftat: organisationer.length ? Math.round((medBekraftat / organisationer.length) * 1000) / 10 : 0,
      fakta_per_status: faktaPerStatus,
      senast_verifierad: senast,
      aldsta_kontroll_dagar: dagar.length ? Math.max(...dagar) : null,
      antal_over_180_dagar: dagar.filter((d) => d > 180).length,
      utan_plats: organisationer.filter((o) => !o.h.position).length,
    },
    byggd: new Date().toISOString().slice(0, 10),
  };
  return cache;
}

/** Fälten i den ordning de visas på organisationssidan, med svenska etiketter. */
export const FALT: { nyckel: keyof OrgData; etikett: string }[] = [
  { nyckel: 'name', etikett: 'Namn' },
  { nyckel: 'legal_name', etikett: 'Registrerat namn' },
  { nyckel: 'type', etikett: 'Organisationstyp' },
  { nyckel: 'org_number', etikett: 'Organisationsnummer' },
  { nyckel: 'description', etikett: 'Vad de bygger' },
  { nyckel: 'offers', etikett: 'Erbjuder' },
  { nyckel: 'areas', etikett: 'Områden' },
  { nyckel: 'kommun', etikett: 'Säte (kommun)' },
  { nyckel: 'coordinates', etikett: 'Position' },
  { nyckel: 'founded', etikett: 'Grundat' },
  { nyckel: 'active', etikett: 'Aktiv' },
];

export function allaFakta(o: OrgData): { nyckel: keyof OrgData; etikett: string; fakta: Fakta }[] {
  const ut: { nyckel: keyof OrgData; etikett: string; fakta: Fakta }[] = [];
  for (const f of FALT) {
    const v = o[f.nyckel] as Fakta | undefined;
    if (v && typeof v === 'object' && 'status' in v) ut.push({ nyckel: f.nyckel, etikett: f.etikett, fakta: v });
  }
  return ut;
}

/** Visningsvärde för ett fält. */
export function visaVarde(d: Dataset, o: Org, nyckel: keyof OrgData, fakta: Fakta): string {
  const v = fakta.value;
  if (v === null || v === undefined) return '–';
  switch (nyckel) {
    case 'type':
      return d.etikett.typer.get(v as string)?.label ?? String(v);
    case 'offers':
      return (v as string[]).map((x) => d.etikett.erbjuder.get(x)?.label ?? x).join(', ');
    case 'areas':
      return (v as string[]).map((x) => d.etikett.omraden.get(x)?.label ?? x).join(', ');
    case 'kommun':
      return o.h.kommun_namn ? `${o.h.kommun_namn}, ${o.h.lan_namn}` : String(v);
    case 'coordinates': {
      const c = v as { lat: number; lng: number };
      return `${c.lat.toFixed(4)}, ${c.lng.toFixed(4)}`;
    }
    case 'active':
      return v ? 'Ja' : 'Nej, nedlagd eller avregistrerad';
    default:
      return String(v);
  }
}

export function statusEtikett(d: Dataset, status: string): string {
  return d.etikett.status.get(status)?.label ?? status;
}
export function kalltypEtikett(d: Dataset, typ?: string): string {
  return typ ? d.etikett.kalltyper.get(typ)?.label ?? typ : '';
}

export function formateraDatum(iso: string | null | undefined): string {
  if (!iso) return '–';
  const [y, m, dd] = iso.split('-').map(Number);
  const manader = ['jan', 'feb', 'mars', 'april', 'maj', 'juni', 'juli', 'aug', 'sep', 'okt', 'nov', 'dec'];
  return `${dd} ${manader[(m ?? 1) - 1]} ${y}`;
}

/** Organisationstyper som har en ikon i public/ikoner/typ/, med adress. */
export function typikoner(): Record<string, string> {
  const typIds = hamtaData().taxonomi.typer.map((t) => t.id);
  return hittaTypikoner(typIds, (fil) => fs.existsSync(path.join(ROT, 'public', fil)), url);
}

/** Bygger en absolut eller basrelativ URL inom sajten. */
export function url(stig: string): string {
  const bas = import.meta.env.BASE_URL.replace(/\/$/, '');
  if (stig === '/') return bas || '/';
  return `${bas}${stig.startsWith('/') ? '' : '/'}${stig}`;
}

export function absolutUrl(stig: string): string {
  const site = (import.meta.env.SITE || 'https://karta.opensverige.se').replace(/\/$/, '');
  return `${site}${url(stig)}`;
}

/** Kompakt post för kartan och listan i webbläsaren. */
export function tillKartpost(o: Org) {
  return {
    id: o.id,
    n: o.name.value,
    t: o.type.value,
    o: o.offers.value,
    a: o.areas.value,
    k: o.kommun.value,
    kn: o.h.kommun_namn,
    l: o.h.lan_kod,
    ln: o.h.lan_namn,
    lat: o.h.position?.lat ?? null,
    lng: o.h.position?.lng ?? null,
    pt: o.h.position_typ,
    d: o.description.value,
    s: o.h.senast_verifierad,
    c: o.h.antal_bekraftade,
    f: o.h.antal_fakta,
    w: o.website,
    i: o.links?.infra_id ?? null,
  };
}
export type Kartpost = ReturnType<typeof tillKartpost>;

export const SAJT = {
  namn: 'OpenSverige AI-kartan',
  kort: 'AI-kartan',
  titel: 'Tech Embassy – Sveriges öppna AI-karta',
  tagline: 'Alla som bygger AI i Sverige, inte bara de som en kommitté har godkänt.',
  repo: 'https://github.com/opensverige/ai-kartan',
  discord: 'https://discord.gg/ZbV4qB34um',
  /** Kanalen där tillägg och rättelser tas emot. Länken fungerar bara för den som redan är med på servern. */
  discordKanal: { namn: 'infra-intag', url: 'https://discord.com/channels/1466847548864987289/1552282091331526696' },
  infra: 'https://infra.opensverige.se',
  opensverige: 'https://opensverige.se',
};
