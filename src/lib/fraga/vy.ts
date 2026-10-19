// Paletten som HTML: förslagen medan man skriver och svaret när man frågar. Raderna ritas ur
// kartans egen data, aldrig ur modellens text. All text som kommer utifrån escapas. Ingen
// statuskod, inget "Error" och ingen röd ruta: varje läge har en lugn rad och en väg framåt
// (specen 3.2–3.8). Rena funktioner, så att texterna går att pröva.

import { normalisera } from '../sok.ts';
import type { Etiketter } from '../sokindex.ts';
import { arInfrafraga } from './forfilter.ts';
import type { Platsrad } from './kartgranssnitt.ts';
import { MAX_TECKEN, type Kunskap, type Modellfelsort, type Svar } from './typer.ts';

export interface Lankar {
  kartbas: string;
  orgbas: string;
  bidra: string;
  discord: string;
  /** Systersajten AI-Infra och dess logga. */
  infra: string;
  infralogo: string;
  /** Sidan visas i betan, med ?fraga=1. Då bär länkarna till kartan flaggan. */
  beta?: boolean;
}

/** Etiketterna som sidan har, med typernas ikoner när de finns. */
export type Vyetiketter = Etiketter & { typikoner?: Record<string, string> };

/** Var svaret kom ifrån: servern, webbläsarens egen reservväg, eller reservvägen för att takten nåtts. */
export type Klientlage = 'server' | 'lokal' | 'takt';

/** Det en rad visar om en organisation, ur kartans data. */
export interface Radpost {
  id: string;
  n: string;
  t: string;
  kn: string | null;
  d: string | null;
  ds: string;
  dv: string | null;
}

/** Svaret i paletten: listan, raden längst ner och det som läses upp. */
export interface Svarsvy {
  kropp: string;
  /** Tom när svaret inte har någon väg vidare. */
  vidare: string;
  besked: string;
}

const STATUS: Record<string, string> = { confirmed: 'bekräftad', claimed: 'egen uppgift', planned: 'planerad', unknown: 'okänd' };
const PAUSAD: readonly Modellfelsort[] = ['saknas', 'slut', 'nyckel', 'modell', 'tak'];
const ORDEN = 'Svaren bygger på orden i din fråga.';
/** Så många tecken av beskrivningen visas före träffen, så att ordet hamnar tidigt även på en telefon. */
const FORE = 12;

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
}

/** Kartans adress för en relativ länk som "/?q=röst", med sajtens bas. */
function kartadress(l: Lankar, kartlank: string): string {
  return `${l.kartbas.replace(/\/$/, '')}${kartlank}`;
}

/**
 * Knappen Visa alla på kartan. Ett vanligt klick byter urval utan att ladda om, men en ny flik
 * läser adressen. I betan bär adressen därför flaggan, och utan urval också #karta, eftersom
 * betan annars börjar på första skärmen. Kopian till Discord får inte flaggan: betan är dold.
 */
function kartknapp(l: Lankar, kartlank: string): string {
  if (!l.beta) return kartadress(l, kartlank);
  return kartadress(l, kartlank.includes('?') ? `${kartlank}&fraga=1` : `${kartlank}?fraga=1#karta`);
}

function initialer(namn: string): string {
  const ord = namn.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
  if (!ord.length) return '?';
  return (ord.length === 1 ? ord[0].slice(0, 2) : ord[0][0] + ord[1][0]).toUpperCase();
}

/**
 * Beskrivningen från strax före ordet, med ordet markerat. Utan träff visas texten som den står.
 * Normaliseringen behåller längden för svenska tecken. Gör den inte det stämmer inte positionen,
 * och då markeras ingenting.
 */
export function utdrag(text: string, ord: string): string {
  const nt = normalisera(text);
  const no = normalisera(ord.trim());
  const i = no ? nt.indexOf(no) : -1;
  if (i < 0 || nt.length !== text.length) return esc(text);
  const fran = i > FORE + 10 ? i - FORE : 0;
  return `${fran ? '…' : ''}${esc(text.slice(fran, i))}<mark>${esc(text.slice(i, i + no.length))}</mark>${esc(text.slice(i + no.length))}`;
}

function ikonHtml(o: Radpost, e: Vyetiketter): string {
  const bild = e.typikoner?.[o.t];
  if (bild) return `<span class="palett-rad__ikon palett-rad__ikon--bild" aria-hidden="true"><img src="${esc(bild)}" alt="" loading="lazy" decoding="async"></span>`;
  return `<span class="palett-rad__ikon palett-rad__ikon--${esc(o.t)}" aria-hidden="true">${esc(initialer(o.n))}</span>`;
}

/** En organisation som rad. `under` är färdig HTML, till exempel ett utdrag. */
export function radHtml(o: Radpost, under: string, e: Vyetiketter): string {
  const typ = e.typer[o.t] ?? o.t;
  const status = STATUS[o.ds] ?? STATUS.unknown;
  const datum = o.dv ? `, kontrollerad ${esc(o.dv)}` : '';
  return (
    `<div class="palett-rad" role="option" aria-selected="false" data-org="${esc(o.id)}">` +
    ikonHtml(o, e) +
    `<span class="palett-rad__text"><span class="palett-rad__namn">${esc(o.n)}</span><span class="palett-rad__under">${under}</span></span>` +
    `<span class="palett-rad__hoger"><span class="palett-rad__var">${esc(typ)} · ${esc(o.kn ?? 'Utan plats')}</span>` +
    `<b class="palett-rad__marke palett-rad__marke--${esc(o.ds)}" title="${esc(status)}${datum}">${status}<span class="visuellt-dold">${datum}</span></b></span>` +
    `</div>`
  );
}

/**
 * Raden till systersajten AI-Infra, som jämför leverantörer av GPU, hosting och inferens i detalj.
 * Den står när frågan gäller infrastruktur, före organisationerna, som kortet i kartans lista.
 */
function infraradHtml(l: Lankar): string {
  const adress = l.infra.replace(/^https?:\/\//, '').replace(/\/$/, '');
  return (
    `<a class="palett-rad palett-rad--infra" role="option" aria-selected="false" tabindex="-1" href="${esc(l.infra)}" rel="noopener" target="_blank" data-infrarad>` +
    `<span class="palett-rad__ikon palett-rad__ikon--bild" aria-hidden="true"><img src="${esc(l.infralogo)}" alt="" width="30" height="30" loading="lazy" decoding="async"></span>` +
    `<span class="palett-rad__text"><span class="palett-rad__namn">Jämför på AI-Infra ↗</span>` +
    `<span class="palett-rad__under">GPU, hosting och inferens: pris, datacenter och ägande per leverantör</span></span>` +
    `<span class="palett-rad__hoger"><span class="palett-rad__var">${esc(adress)}</span></span></a>`
  );
}

/** Raden under namnet i ett svar: utdraget runt det som matchade, eller skälen när träffen inte står i texten. */
function skalUnder(o: Radpost, skal: readonly string[]): string {
  const ord = skal.join(' ').match(/”([^”]+)”/)?.[1];
  if (ord && o.d && normalisera(o.d).includes(normalisera(ord))) return utdrag(o.d, ord);
  return esc([skal.length ? `Matchar ${skal.join(' · ')}` : '', o.d ?? ''].filter(Boolean).join(' · '));
}

/** Medan man skriver: Fråga AI överst, sedan organisationer och platser ur kartans egen sökning. */
export function forslagHtml(q: string, org: readonly Radpost[], platser: readonly Platsrad[], e: Vyetiketter, l: Lankar): string {
  const fraga = q.trim();
  const forLang = fraga.length > MAX_TECKEN;
  const forsta = fraga.split(/\s+/)[0] ?? '';
  const delar = [
    `<div class="palett-rad palett-rad--ai" role="option" aria-selected="false" data-fraga${forLang ? ' aria-disabled="true"' : ''}>` +
      `<span class="palett-rad__ikon palett-rad__ikon--ai" aria-hidden="true">✦</span>` +
      `<span class="palett-rad__text"><span class="palett-rad__namn">Fråga AI <span class="palett-rad__fraga">”${esc(fraga)}”</span></span>` +
      `<span class="palett-rad__under">${forLang ? 'Frågan är för lång. Korta den lite.' : 'Svarar med organisationer på kartan, med källor'}</span></span>` +
      `<kbd class="palett-rad__tangent" aria-hidden="true">↵</kbd></div>`,
  ];
  if (arInfrafraga(fraga)) delar.push(infraradHtml(l));
  if (org.length) {
    delar.push(
      `<div role="group" aria-label="Organisationer"><p class="palett__rubrik" aria-hidden="true">Organisationer</p>` +
        org.map((o) => radHtml(o, utdrag(o.d ?? '', forsta), e)).join('') +
        `</div>`,
    );
  }
  if (platser.length) {
    delar.push(
      `<div role="group" aria-label="Platser"><p class="palett__rubrik" aria-hidden="true">Platser</p>` +
        platser
          .map(
            (p) =>
              `<div class="palett-rad" role="option" aria-selected="false" data-plats="${esc(p.typ)}:${esc(p.kod)}">` +
              `<span class="palett-rad__ikon palett-rad__ikon--plats" aria-hidden="true">⌖</span>` +
              `<span class="palett-rad__text"><span class="palett-rad__namn">${esc(p.namn)}</span>` +
              `<span class="palett-rad__under">${esc(p.under)} · ${p.antal} ${p.antal === 1 ? 'organisation' : 'organisationer'}</span></span></div>`,
          )
          .join('') +
        `</div>`,
    );
  }
  return `<div class="palett-rader" id="palett-lista" role="listbox" aria-label="Förslag">${delar.join('')}</div>`;
}

/** Raden överst när modellen inte svarade. null när den svarade eller inte behövdes. */
export function lagesrad(s: Pick<Svar, 'modellfel'>, lage: Klientlage): string | null {
  if (s.modellfel === null) return null;
  if (lage === 'takt') return `Du har frågat många gånger i rad. ${ORDEN}`;
  if (lage === 'server' && PAUSAD.includes(s.modellfel)) return `AI-tolkningen är pausad just nu. ${ORDEN}`;
  return `AI:n svarade inte den här gången. ${ORDEN}`;
}

/** Discord och kopian av frågan. Kopian bär en länk till urvalet på kartan. */
export function overlamnaHtml(fraga: string, kartlank: string, l: Lankar): string {
  const kopia = `${fraga}\n(via ${kartadress(l, kartlank)})`;
  return (
    `<a class="palett__knapp palett__knapp--discord" href="${esc(l.discord)}" rel="noopener" target="_blank" data-klick="discord">Bolla med builders i Discord →</a>` +
    `<button type="button" class="palett__knapp palett__knapp--tyst" data-kopiera="${esc(kopia)}">Kopiera frågan</button>`
  );
}

export function ingenAnslutningHtml(): string {
  return '<p class="palett__text">Ingen anslutning just nu.</p><button type="button" class="palett__knapp" data-forsok>Försök igen →</button>';
}

const tumme = (): string =>
  '<span class="palett-tumme">Hjälpte det? <button type="button" data-tumme="ja" aria-pressed="false">Ja</button><button type="button" data-tumme="nej" aria-pressed="false">Nej</button></span>';

function hurHtml(s: Svar, antal: number, e: Etiketter): string {
  const delar: string[] = [];
  if (s.filter.omrade.length) delar.push(`område ${s.filter.omrade.map((id) => e.omraden[id] ?? id).join(' eller ')}`);
  if (s.filter.erbjuder.length) delar.push(`erbjuder ${s.filter.erbjuder.map((id) => (e.erbjuder[id] ?? id).toLowerCase()).join(' eller ')}`);
  if (s.filter.typ.length) delar.push(`typ ${s.filter.typ.map((id) => e.typer[id] ?? id).join(' eller ')}`);
  if (s.filter.kommun) delar.push('en kommun');
  else if (s.filter.lan) delar.push(e.lan[s.filter.lan] ?? 'ett län');
  if (s.filter.q) delar.push(`orden ”${s.filter.q}”`);
  const regel = s.regel === 'dagligt' ? `Visar ${s.visade.length}: ett urval som byts varje dag, i namnordning.` : 'Alla visas, i namnordning.';
  return (
    `<details class="palett-hur"><summary>Så hittade jag dem</summary><ol>` +
    `<li>Frågan blev ett filter: ${esc(delar.join(', ') || 'inga val')}.${s.utanModell ? ' Tolkningen gjordes utan AI.' : ''}</li>` +
    `<li>Kartan söktes med filtret: ${s.totalt} av ${antal} matchar.</li>` +
    `<li>${regel}</li>` +
    `<li>Text och status kommer direkt ur kartans data.</li>` +
    `</ol><p>Modellen väljer inte vilka som visas eller i vilken ordning.</p></details>`
  );
}

function faqHtml(ids: readonly string[], faq: readonly Kunskap[]): string {
  return ids
    .map((id) => faq.find((f) => f.id === id))
    .filter((f): f is Kunskap => Boolean(f))
    .map((f) => {
      const kalla = f.kalla_url.replace(/^https:\/\//, '').replace(/\/$/, '');
      return `<p class="palett__text">${esc(f.svar)}</p><p class="palett__kalla">Källa: <a href="${esc(f.kalla_url)}" rel="noopener" target="_blank">${esc(kalla)}</a> · kontrollerad ${esc(f.kontrollerad)}</p>`;
    })
    .join('');
}

/** Fyra smalare frågor när frågan är bred eller ber om en rankning. Var och en är en ny fråga. */
const SMALARE: readonly (readonly [string, string])[] = [
  ['Ett område, till exempel hälsa', 'Vilka arbetar med AI inom hälsa?'],
  ['En ort, till exempel Göteborg', 'Vilka bygger AI i Göteborg?'],
  ['Infrastruktur och GPU', 'Jag behöver GPU-kapacitet i Sverige'],
  ['Lärosäten och forskning', 'Vilka lärosäten forskar på AI?'],
];

/** Piller som ställer en fråga: [text på pillret, frågan]. */
export function chipsHtml(rader: readonly (readonly [string, string])[]): string {
  return `<div class="palett-chips">${rader.map(([etikett, fraga]) => `<button type="button" class="palett-chip" data-skicka="${esc(fraga)}"><span class="palett-chip__glyf" aria-hidden="true">✦</span>${esc(etikett)}</button>`).join('')}</div>`;
}

const text = (t: string): string => `<p class="palett__text">${esc(t)}</p>`;

/** Hela svaret i paletten. `fraga` behövs bara för kopian till Discord. */
export function svarHtml(
  s: Svar,
  lage: Klientlage,
  poster: ReadonlyMap<string, Radpost>,
  faq: readonly Kunskap[],
  e: Vyetiketter,
  l: Lankar,
  fraga: string,
): Svarsvy {
  const kropp: string[] = [];
  const vidare: string[] = [];
  const rad = lagesrad(s, lage);
  if (rad) kropp.push(`<p class="palett-lagesrad"><span aria-hidden="true">✦</span>${esc(rad)}</p>`);
  if (s.okandPlats) kropp.push(text(`Jag hittar ingen plats som heter ”${s.okandPlats}”, så jag sökte i hela Sverige.`));
  if (s.borttaget.length) kropp.push(text(`Ingen nämner ”${s.borttaget.join(' ')}”. Här är det som matchar resten av frågan.`));
  const discord = overlamnaHtml(fraga, s.kartlank, l);
  const infra = s.filter.erbjuder.includes('infrastruktur') || s.filter.typ.includes('infrastruktur') || arInfrafraga(fraga) ? infraradHtml(l) : '';
  // data-kartlank: sidan byter urval på kartan själv i stället för att ladda om (svarets filter eller alla).
  const allaPaKartan = `<a class="palett__knapp" href="${esc(kartknapp(l, '/'))}" data-kartlank="alla">Visa alla ${poster.size} på kartan →</a>`;
  let besked = '';

  switch (s.sort) {
    case 'traffar': {
      const urval = s.regel === 'dagligt' ? ` · visar ${s.visade.length}, urvalet byts varje dag` : '';
      kropp.push(
        `<div class="palett-svarshuvud"><span class="palett-svarshuvud__glyf" aria-hidden="true">✦</span>` +
          `<p>${esc(s.tolkning)}<small>${s.totalt} på kartan matchar${urval} · i namnordning</small></p></div>`,
      );
      const rader = s.visade
        .map((id) => poster.get(id))
        .filter((o): o is Radpost => Boolean(o))
        .map((o) => radHtml(o, skalUnder(o, s.skal[o.id] ?? []), e));
      kropp.push(`<div class="palett-rader" id="palett-lista" role="listbox" aria-label="Träffar på kartan">${infra}${rader.join('')}</div>`);
      kropp.push(hurHtml(s, poster.size, e));
      vidare.push(`<a class="palett__knapp" href="${esc(kartknapp(l, s.kartlank))}" data-kartlank="svar">Visa alla ${s.totalt} på kartan →</a>`);
      if (s.manniska) vidare.push(discord);
      vidare.push(tumme());
      besked = `${s.totalt} på kartan matchar.`;
      break;
    }
    case 'bred':
      besked = `Alla ${poster.size} på kartan bygger AI, så jag behöver veta mer. Vad är viktigast?`;
      kropp.push(text(besked), chipsHtml(SMALARE));
      vidare.push(allaPaKartan);
      break;
    case 'manniska':
      besked = 'Det låter som något att prata igenom med folk som har gjort det. Kartan visar organisationer, inte personer.';
      kropp.push(text(besked));
      vidare.push(discord);
      break;
    case 'ranking':
      besked = 'Kartan rankar inte, och det gör inte jag heller. Ingen kan köpa en plats.';
      kropp.push(text(`${besked} Jag kan visa vilka som bygger det du letar efter. Vad ska de bygga, eller var ska de finnas?`), chipsHtml(SMALARE));
      break;
    case 'kontakt':
      besked = 'Jag kan inte introducera dig eller ge kontaktuppgifter till personer.';
      kropp.push(text(`${besked} Kartan har inga personuppgifter. Organisationens egen sida finns på varje rad.`));
      vidare.push(discord);
      break;
    case 'opensverige':
      kropp.push(faqHtml(s.faq, faq) || `<p class="palett__text">Läs om föreningen på <a href="https://opensverige.se" rel="noopener" target="_blank">opensverige.se →</a></p>`);
      vidare.push(tumme());
      besked = 'Svar om OpenSverige.';
      break;
    case 'tomt':
      besked = 'Jag hittar ingen på kartan som matchar det.';
      kropp.push(text(`${besked} Kartan har inte allt, så någon i communityn kan veta mer.`));
      if (infra) kropp.push(`<div class="palett-rader" id="palett-lista" role="listbox" aria-label="AI-Infra">${infra}</div>`);
      vidare.push(discord, `<a class="palett__lank" href="${esc(l.bidra)}">Saknas någon? Föreslå den →</a>`);
      break;
    case 'utanfor':
      besked = 'Jag är till för frågor om svenska AI-byggare, organisationer, infrastruktur och OpenSverige.';
      kropp.push(text(besked));
      break;
  }
  return { kropp: kropp.join(''), vidare: vidare.join(''), besked: rad ? `${rad} ${besked}` : besked };
}
