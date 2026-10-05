// Bedömer ett tips från det korta formuläret "Lägg till en organisation".
// Ren logik utan in- och utmatning, så att reglerna går att testa: scripts/tips.test.mjs.

import { parsa, ikryssade, normaliseraUrl } from './arende.mjs';

const BORTTAGET = '[borttaget]';
const NUMMER = /(?<!\d)(?:(?:19|20)\d{6}|\d{6})[-+ ]?\d{4}(?!\d)/g;

/** De nummer i texten som ser ut som personnummer eller samordningsnummer.
 *  Där står månaden på tredje och fjärde plats. Juridiska personer har alltid 20 eller mer där. */
function personnummerI(text) {
  return (text.match(NUMMER) ?? []).filter((nummer) => {
    const tio = nummer.replace(/\D/g, '').slice(-10);
    return Number(tio.slice(2, 4)) < 20;
  });
}

/** Länken om den går att läsa som en webbadress med domän, annars null. */
function lank(varde) {
  const u = normaliseraUrl(varde);
  if (!u) return null;
  try {
    return new URL(u).hostname.includes('.') ? u : null;
  } catch {
    return null;
  }
}

function adress(u) {
  try {
    const { hostname, pathname } = new URL(u);
    return { vard: hostname.toLowerCase().replace(/^www\./, ''), stig: pathname.replace(/\/+$/, '').toLowerCase() };
  } catch {
    return null;
  }
}

const jamforNamn = (s) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(ab|aktiebolag)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** Organisationen på kartan som tipset verkar gälla, eller null. */
function hittaDubblett(namn, webbplats, organisationer) {
  const tips = webbplats ? adress(webbplats) : null;
  const tipsNamn = jamforNamn(namn);
  const traff = organisationer.find((o) => {
    if (tipsNamn && jamforNamn(o.namn) === tipsNamn) return true;
    const finns = o.webbplats ? adress(o.webbplats) : null;
    // Samma värd räcker inte: flera organisationer kan dela till exempel github.com.
    // Det är en dubblett först när sökvägen är densamma eller någon av dem pekar på hela webbplatsen.
    return Boolean(tips && finns && tips.vard === finns.vard && (tips.stig === finns.stig || !tips.stig || !finns.stig));
  });
  return traff ? { id: traff.id, namn: traff.namn } : null;
}

/**
 * Läser ärendetexten och avgör vad som ska hända med tipset.
 * `organisationer` är de som redan finns på kartan: { id, namn, webbplats }.
 */
export function bedomTips(kropp, organisationer) {
  const f = parsa(kropp);
  const enskild = ikryssade(f['Enskild firma']).length > 0;
  const namn = (f['Namn'] || '').replace(/\s+/g, ' ').trim();
  const angivetOrgnr = (f['Organisationsnummer (valfritt)'] || '').trim();

  // En enskild firmas organisationsnummer är personens personnummer, hur det än ser ut.
  const bort = new Set([...personnummerI(namn), ...personnummerI(angivetOrgnr)]);
  if (enskild && angivetOrgnr) bort.add(angivetOrgnr);
  let rensadKropp = null;
  if (bort.size) {
    rensadKropp = kropp;
    for (const nummer of bort) rensadKropp = rensadKropp.split(nummer).join(BORTTAGET);
  }

  const webbplats = lank(f['Webbplats']);
  const belagg = lank(f['Länk till något ni byggt med AI']);
  const fel = [];
  if (!namn) fel.push('Namnet saknas.');
  if (!webbplats) fel.push('Webbplatsen saknas eller går inte att läsa som en länk. Skriv den som https://exempel.se.');
  if (!belagg) fel.push('Länken till något ni byggt med AI saknas eller går inte att läsa. Det får vara samma sida som webbplatsen.');

  return {
    tips: {
      namn,
      webbplats: webbplats ?? '',
      belagg: belagg ?? '',
      orgnr: enskild || personnummerI(angivetOrgnr).length ? '' : angivetOrgnr,
      enskild,
    },
    fel,
    dubblett: hittaDubblett(namn, webbplats, organisationer),
    rensadKropp,
  };
}

/**
 * Svaret som boten skriver i ärendet. Det upprepar aldrig det tipsaren skrev:
 * texten ligger i ett publikt ärende och ska inte kunna användas för att nämna folk eller sprida länkar.
 */
export function skrivSvar(resultat, { sajt, repo, andrad = false }) {
  const stycken = [];
  if (resultat.rensadKropp) {
    stycken.push(
      'Ett nummer som såg ut som ett personnummer har tagits bort ur ärendet. För en enskild firma är organisationsnumret ett personnummer och ska aldrig skrivas här. Till den som granskar: radera även den tidigare versionen ur ärendets redigeringshistorik.',
    );
  }
  if (resultat.fel.length) {
    stycken.push(
      `${andrad ? 'Tack, ärendet är uppdaterat.' : 'Tack!'} ${resultat.fel.length === 1 ? 'En sak behöver' : 'Några saker behöver'} rättas innan vi kan gå vidare:`,
      resultat.fel.map((f) => `- ${f}`).join('\n'),
      'Redigera ärendet (knappen ••• och sedan Edit), så läser vi det igen.',
    );
  } else if (resultat.dubblett) {
    stycken.push(
      `Tack! ${resultat.dubblett.namn} verkar redan finnas på kartan: ${sajt}/organisation/${resultat.dubblett.id}`,
      'Stämmer något inte där? Använd knappen Begär rättelse på den sidan. Gäller tipset en annan organisation, skriv det i en kommentar så tittar vi.',
    );
  } else {
    stycken.push(andrad ? 'Tack, ärendet är uppdaterat och ser bra ut.' : 'Tack! Tipset är mottaget.');
    stycken.push(
      resultat.tips.enskild
        ? 'Eftersom det gäller en enskild firma läser ingen robot din webbplats. Skriv i en kommentar vilken kommun du verkar i och en mening om vad du bygger, så skriver vi posten utifrån det. Du kan få posten borttagen när som helst.'
        : `Vi läser webbplatsen, skriver posten och hör av oss här i ärendet inom 14 dagar. En människa granskar den mot [kriterierna](${repo}/blob/main/kriterier.md) innan den publiceras. Det som står på er egen webbplats märks som egen uppgift, och det som går att bekräfta mot register märks som bekräftat.`,
    );
  }
  return `${stycken.join('\n\n')}\n`;
}
