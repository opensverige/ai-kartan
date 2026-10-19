// Svaren som HTML. Korten ritas ur kartans egen data, aldrig ur modellens text. All text som
// kommer utifrån escapas. Ingen statuskod, inget "Error" och ingen röd ruta: varje läge har en
// lugn rad och en väg framåt (specen 3.5–3.8). Rena funktioner, så att texterna går att pröva.

import type { Kartpost } from '../data.ts';
import type { Etiketter } from '../sokindex.ts';
import type { Kunskap, Modellfelsort, Svar } from './typer.ts';

export interface Lankar {
  kartbas: string;
  orgbas: string;
  bidra: string;
  discord: string;
}

/** Var svaret kom ifrån: servern, webbläsarens egen reservväg, eller reservvägen för att takten nåtts. */
export type Klientlage = 'server' | 'lokal' | 'takt';

const STATUS: Record<string, string> = { confirmed: 'bekräftad', claimed: 'egen uppgift', planned: 'planerad', unknown: 'okänd' };
const PAUSAD: readonly Modellfelsort[] = ['saknas', 'slut', 'nyckel'];
const ORDEN = 'Svaren bygger på orden i din fråga.';

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
}

/** Kartans adress för en relativ länk som "/?q=röst", med sajtens bas. */
function kartadress(l: Lankar, kartlank: string): string {
  return `${l.kartbas.replace(/\/$/, '')}${kartlank}`;
}

export function kortHtml(o: Kartpost, skal: readonly string[], e: Etiketter, l: Lankar): string {
  const typ = e.typer[o.t] ?? o.t;
  const status = STATUS[o.ds] ?? STATUS.unknown;
  const datum = o.dv ? ` kontrollerad ${esc(o.dv)}` : '';
  const matchar = skal.length ? `<p class="kort__varfor">Matchar: ${esc(skal.join(' · '))}</p>` : '';
  return (
    `<article class="kort" data-id="${esc(o.id)}">` +
    `<div class="kort__huvud"><span class="kort__prick kort__prick--${esc(o.t)}" aria-hidden="true"></span>` +
    `<button type="button" class="kort__namn" data-flyg="${esc(o.id)}">${esc(o.n)}</button>` +
    `<span class="kort__var">${esc(typ)} · ${esc(o.kn ?? 'Utan plats')}</span></div>` +
    `<p class="kort__text">${esc(o.d ?? '')}</p>` +
    `<p class="kort__status"><b class="kort__marke kort__marke--${esc(o.ds)}">${status}</b>${datum}</p>` +
    matchar +
    `<a class="kort__lank" href="${esc(l.orgbas)}${encodeURIComponent(o.id)}">Visa på Tech Embassy →</a>` +
    `</article>`
  );
}

/** Raden överst när modellen inte svarade. null när den svarade eller inte behövdes. */
export function lagesrad(s: Pick<Svar, 'modellfel'>, lage: Klientlage): string | null {
  if (s.modellfel === null) return null;
  if (lage === 'takt') return `Du har frågat många gånger i rad. ${ORDEN}`;
  if (lage === 'server' && PAUSAD.includes(s.modellfel)) return `AI-tolkningen är pausad just nu. ${ORDEN}`;
  return `AI:n svarade inte den här gången. ${ORDEN}`;
}

export function overlamnaHtml(fraga: string, kartlank: string, l: Lankar): string {
  const kopia = `${fraga}\n(via ${kartadress(l, kartlank)})`;
  return (
    `<div class="overlamna"><p><b>Vill du bolla det här med folk som bygger?</b> Ta frågan till OpenSveriges Discord.</p>` +
    `<div class="overlamna__knappar">` +
    `<a class="knapp knapp--discord" href="${esc(l.discord)}" rel="noopener" target="_blank">Bolla med builders i Discord →</a>` +
    `<button type="button" class="knapp knapp--tyst" data-kopiera="${esc(kopia)}">Kopiera frågan</button>` +
    `</div></div>`
  );
}

export function ingenAnslutningHtml(): string {
  return '<p class="svar__text">Ingen anslutning just nu.</p><button type="button" class="knapp knapp--mork" data-forsok>Försök igen →</button>';
}

const tumme = (): string =>
  '<div class="tumme">Hjälpte det? <button type="button" data-tumme="ja" aria-pressed="false">Ja</button><button type="button" data-tumme="nej" aria-pressed="false">Nej</button></div>';

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
    `<details class="hur"><summary>Så hittade jag dem</summary><ol>` +
    `<li>Frågan blev ett filter: ${esc(delar.join(', ') || 'inga val')}.${s.utanModell ? ' Tolkningen gjordes utan AI.' : ''}</li>` +
    `<li>Kartan söktes med filtret: ${s.totalt} av ${antal} matchar.</li>` +
    `<li>${regel}</li>` +
    `<li>Kortens text och status kommer direkt ur kartans data.</li>` +
    `</ol><p>Modellen väljer inte vilka som visas eller i vilken ordning.</p></details>`
  );
}

function faqHtml(ids: readonly string[], faq: readonly Kunskap[]): string {
  return ids
    .map((id) => faq.find((f) => f.id === id))
    .filter((f): f is Kunskap => Boolean(f))
    .map((f) => {
      const kalla = f.kalla_url.replace(/^https:\/\//, '').replace(/\/$/, '');
      return `<p class="svar__text">${esc(f.svar)}</p><p class="svar__kalla">Källa: <a href="${esc(f.kalla_url)}" rel="noopener" target="_blank">${esc(kalla)}</a> · kontrollerad ${esc(f.kontrollerad)}</p>`;
    })
    .join('');
}

const BRED_SNABBSVAR: readonly [string, string][] = [
  ['Ett område, till exempel hälsa', 'Vilka arbetar med AI inom hälsa?'],
  ['En ort, till exempel Göteborg', 'Vilka bygger AI i Göteborg?'],
  ['Infrastruktur och GPU', 'Jag behöver GPU-kapacitet i Sverige'],
  ['Lärosäten och forskning', 'Vilka lärosäten forskar på AI?'],
];

/** Hela svaret i samtalet. `fraga` behövs bara för Discord-rutans kopia. */
export function svarHtml(
  s: Svar,
  lage: Klientlage,
  poster: ReadonlyMap<string, Kartpost>,
  faq: readonly Kunskap[],
  e: Etiketter,
  l: Lankar,
  fraga: string,
): string {
  const delar: string[] = [];
  const rad = lagesrad(s, lage);
  if (rad) delar.push(`<p class="lagesrad"><span aria-hidden="true">✦</span>${esc(rad)}</p>`);
  if (s.okandPlats) delar.push(`<p class="svar__text">Jag hittar ingen plats som heter ”${esc(s.okandPlats)}”, så jag sökte i hela Sverige.</p>`);
  if (s.borttaget.length) delar.push(`<p class="svar__text">Ingen nämner ”${esc(s.borttaget.join(' '))}”. Här är det som matchar resten av frågan.</p>`);
  const discord = overlamnaHtml(fraga, s.kartlank, l);
  const allaPaKartan = `<a href="${esc(kartadress(l, '/'))}">Eller se alla ${poster.size} på kartan →</a>`;

  switch (s.sort) {
    case 'traffar': {
      if (s.tolkning) delar.push(`<p class="svar__tolkning">${esc(s.tolkning)}</p>`);
      const urval = s.regel === 'dagligt' ? ` · visar ${s.visade.length}, urvalet byts varje dag` : '';
      delar.push(`<p class="svar__meta"><span>${s.totalt} på kartan matchar${urval}</span> <a href="${esc(kartadress(l, s.kartlank))}">Visa alla ${s.totalt} på kartan →</a></p>`);
      for (const id of s.visade) {
        const o = poster.get(id);
        if (o) delar.push(kortHtml(o, s.skal[id] ?? [], e, l));
      }
      delar.push(hurHtml(s, poster.size, e));
      if (s.manniska) delar.push(discord);
      delar.push(tumme());
      break;
    }
    case 'bred':
      delar.push(`<p class="svar__tolkning">Alla ${poster.size} på kartan bygger AI, så jag behöver veta mer. Vad är viktigast?</p>`);
      delar.push(`<div class="svarsrader">${BRED_SNABBSVAR.map(([text, fraga2]) => `<button type="button" data-skicka="${esc(fraga2)}">${esc(text)}</button>`).join('')}</div>`);
      delar.push(`<p class="svar__meta">${allaPaKartan}</p>`);
      break;
    case 'manniska':
      delar.push('<p class="svar__tolkning">Det låter som något att prata igenom med folk som har gjort det. Kartan visar organisationer, inte personer.</p>');
      delar.push(discord);
      break;
    case 'ranking':
      delar.push('<p class="svar__tolkning">Kartan rankar inte, och det gör inte jag heller. Ingen kan köpa en plats. Jag kan visa vilka som bygger det du letar efter.</p>');
      delar.push('<p class="svar__meta">Vad ska de bygga, eller var ska de finnas?</p>');
      break;
    case 'kontakt':
      delar.push('<p class="svar__tolkning">Jag kan inte introducera dig eller ge kontaktuppgifter till personer. Kartan har inga personuppgifter. Organisationens egen sida finns på varje kort.</p>');
      delar.push(discord);
      break;
    case 'opensverige':
      delar.push(faqHtml(s.faq, faq) || `<p class="svar__text">Läs om föreningen på <a href="https://opensverige.se" rel="noopener" target="_blank">opensverige.se →</a></p>`);
      delar.push(tumme());
      break;
    case 'tomt':
      delar.push('<p class="svar__tolkning">Jag hittar ingen på kartan som matchar det. Kartan har inte allt, så någon i communityn kan veta mer.</p>');
      delar.push(discord);
      delar.push(`<p class="svar__meta"><a href="${esc(l.bidra)}">Saknas någon? Föreslå den →</a></p>`);
      break;
    case 'utanfor':
      delar.push('<p class="svar__tolkning">Jag är till för frågor om svenska AI-byggare, organisationer, infrastruktur och OpenSverige.</p>');
      break;
  }
  return delar.join('');
}
