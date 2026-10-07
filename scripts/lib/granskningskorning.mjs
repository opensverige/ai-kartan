// Körningen bakom granskningslistan: läser en pull request, skriver listan och sätter kontrollens läge.
// Reglerna för hur listan ser ut och läses av står i scripts/lib/granskning.mjs.
//
// Alla anrop till GitHub går genom `api`, som den som anropar skickar in. Då går hela körningen
// att pröva mot ett låtsas-GitHub (scripts/granskningskorning.test.mjs).
//
// Körningen minns ingenting mellan gångerna och bryr sig inte om vilken händelse som startade den.
// Varje gång räknar den ut läget på nytt ur det GitHub självt håller reda på:
//
//   - Vilka organisationer som ändras räknas ur två träd i kodförrådet: pull requestens senaste
//     commit och commiten där den grenade av. Båda pekas ut av id:n ur samma läsning, och ett
//     träd kan inte ändras i efterhand. Listan kan alltså aldrig gälla något annat än den commit
//     som får läget.
//   - Vilka punkter som är avbockade står i flödets egen kommentar.
//   - Att en människa har gått igenom listan intygas i en egen kommentar, skriven av någon med
//     skrivrätt, aldrig redigerad och nyare än listans senaste ändring. En bot kan kryssa i en
//     ruta, men den kan inte skriva en kommentar i en människas namn.
//
// Går något fel blir läget "error", aldrig grönt, och listan rörs inte.

import { tolkaYaml } from './organisationer.mjs';
import { arOrganisationsfil, iOrganisationsmappen, arRegelfil, version, lista, avlas, utfall, behoverRitasOm, arIntyg, MARKOR, KONTEXT, MAX_ORGANISATIONER } from './granskning.mjs';

/** Ett svar från GitHub som inte var 2xx. `status` är svarskoden. */
export class ApiFel extends Error {
  constructor(metod, stig, status) {
    super(`${metod} ${String(stig).split('?')[0]} svarade ${status}`);
    this.status = status;
  }
}

const VANLIG_FIL = new Set(['100644', '100755']);
const MAX_FILSTORLEK = 200_000;
const BOT = 'github-actions[bot]';
const ID = /^[0-9a-f]{40}$/;

/**
 * Hur länge ett anrop ska vänta innan det prövas igen, i millisekunder, eller null om felet inte
 * går över av sig självt. GitHub svarar 403 eller 429 när anropsbudgeten är slut och säger då när
 * den fylls på. Väntan längre än `tak` är ingen idé: då får nästa händelse räkna om läget.
 */
export function vantetid(status, huvuden, nu = Date.now(), tak = 15 * 60_000) {
  const h = (namn) => huvuden?.[namn] ?? huvuden?.get?.(namn) ?? null;
  if (status !== 403 && status !== 429) return null;
  const efter = Number(h('retry-after'));
  if (Number.isFinite(efter) && efter > 0) return efter * 1000 <= tak ? efter * 1000 : null;
  if (String(h('x-ratelimit-remaining')) !== '0') return null;
  const ms = Number(h('x-ratelimit-reset')) * 1000 - nu + 1000;
  return Number.isFinite(ms) && ms > 0 && ms <= tak ? ms : null;
}

/**
 * Vad som skiljer pull requestens träd från trädet där den grenade av. `bas` och `huvud` är
 * raderna ur GitHubs träd-API. Svaret är organisationsfilerna som ändras, det som inte får ligga
 * i mappen, och om någon regelfil ändras.
 */
export function jamforTrad(bas, huvud) {
  const blad = (rader) => new Map(rader.filter((t) => t.type !== 'tree').map((t) => [t.path, t]));
  const fore = blad(bas);
  const efter = blad(huvud);
  const filer = [];
  const ogiltiga = [];
  let regelfiler = false;
  for (const sokvag of new Set([...fore.keys(), ...efter.keys()])) {
    const g = fore.get(sokvag);
    const h = efter.get(sokvag);
    if (g && h && g.sha === h.sha && g.mode === h.mode && g.type === h.type) continue;
    if (arRegelfil(sokvag)) regelfiler = true;
    if (!iOrganisationsmappen(sokvag)) continue;
    if (!h) {
      if (arOrganisationsfil(sokvag)) filer.push({ sokvag, status: 'removed', basblob: g.sha, ersattAv: null });
    } else if (!arOrganisationsfil(sokvag)) ogiltiga.push({ sokvag, skal: 'filnamnet är inte ett id med gemener, siffror och bindestreck följt av .yaml' });
    else if (h.type !== 'blob' || !VANLIG_FIL.has(h.mode)) ogiltiga.push({ sokvag, skal: 'är inte en vanlig fil, till exempel en symbolisk länk' });
    else if (!(h.size <= MAX_FILSTORLEK)) ogiltiga.push({ sokvag, skal: 'filen är för stor för att vara en organisation' });
    else filer.push({ sokvag, status: g ? 'modified' : 'added', blob: h.sha, basblob: g?.type === 'blob' ? g.sha : null });
  }
  // Ett namnbyte syns som en borttagen och en ny fil med samma innehåll. Då sägs vilken som ersätter vilken.
  const nya = filer.filter((f) => f.status === 'added');
  for (const fil of filer.filter((f) => f.status === 'removed')) {
    const samma = nya.filter((n) => n.blob === fil.basblob);
    if (samma.length === 1) fil.ersattAv = samma[0].sokvag;
  }
  for (const fil of filer) {
    fil.version = fil.status === 'removed' ? version('removed', fil.ersattAv ?? '') : version(fil.status, fil.status === 'modified' ? `${fil.basblob}\n${fil.blob}` : fil.blob);
  }
  const efterNamn = (a, b) => a.sokvag.localeCompare(b.sokvag);
  return { filer: filer.sort(efterNamn), ogiltiga: ogiltiga.sort(efterNamn), regelfiler };
}

async function trad(api, repo, sha) {
  if (!ID.test(String(sha))) throw new Error('GitHub gav inget giltigt id för en commit.');
  const svar = await api('GET', `/repos/${repo}/git/trees/${sha}?recursive=1`);
  if (svar.truncated || !Array.isArray(svar.tree)) throw new Error('Kodförrådet är för stort för att läsas i ett svep.');
  return svar.tree;
}

/** Hämtar filens text, samma version som markören gäller, och tolkar den som bygget gör. */
async function lasFil(api, repo, fil) {
  if (fil.status === 'removed') return;
  if (!ID.test(String(fil.blob))) throw new Error(`Filen ${fil.sokvag} saknar version hos GitHub.`);
  const blob = await api('GET', `/repos/${repo}/git/blobs/${fil.blob}`);
  const text = Buffer.from(String(blob.content ?? ''), blob.encoding === 'base64' ? 'base64' : 'utf8').toString('utf8');
  try {
    fil.data = tolkaYaml(text);
  } catch (fel) {
    fil.fel = fel.message;
  }
}

async function allaKommentarer(api, repo, nummer) {
  const ut = [];
  for (let sida = 1; sida <= 30; sida++) {
    const del = await api('GET', `/repos/${repo}/issues/${nummer}/comments?per_page=100&page=${sida}`);
    ut.push(...del);
    if (del.length < 100) return ut;
  }
  throw new Error('Pull requesten har för många kommentarer för att läsas.');
}

/** Flödets egen kommentar. Vem som helst kan skriva en kommentar som ser ut som listan, så bara botens räknas. */
const arLista = (k) => k.user?.type === 'Bot' && k.user?.login === BOT && String(k.body).startsWith(MARKOR);

/** Bara en människa som får skriva i repot får intyga. Går det inte att få svar kastas felet vidare. */
async function farIntyga(api, repo, login) {
  if (!/^[A-Za-z0-9-]{1,39}$/.test(String(login))) return false;
  let ratt;
  try {
    ratt = await api('GET', `/repos/${repo}/collaborators/${login}/permission`);
  } catch (fel) {
    // 404 betyder att kontot inte finns bland dem som får bidra. Allt annat är ett fel hos GitHub.
    if (fel.status === 404) return false;
    throw fel;
  }
  return ratt?.user?.type === 'User' && (['admin', 'write'].includes(ratt.permission) || ['admin', 'maintain', 'write'].includes(ratt.role_name));
}

/**
 * Den som har intygat listan, eller tom sträng. Ett intyg är en kommentar som börjar med /granskad,
 * skriven av en människa med skrivrätt, aldrig redigerad, och nyare än listans senaste ändring.
 * En redigerad kommentar räknas inte: den som får skriva i repot kan ändra andras kommentarer,
 * men ingen kan skapa en kommentar i någon annans namn.
 */
async function hittaIntyg(api, repo, kommentarer, listanAndrad) {
  const intyg = kommentarer
    .filter((k) => k.user?.type === 'User' && arIntyg(k.body) && k.created_at && k.created_at === k.updated_at)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  let foraldrat = false;
  const provade = new Map();
  for (const k of intyg) {
    if (!(Date.parse(k.created_at) > listanAndrad)) {
      foraldrat = true;
      continue;
    }
    const login = k.user.login;
    if (!provade.has(login)) provade.set(login, await farIntyga(api, repo, login));
    if (provade.get(login)) return { intygadAv: login, intygForaldrat: false };
  }
  return { intygadAv: '', intygForaldrat: foraldrat };
}

/**
 * Kör granskningen för en pull request.
 *   torrt     skriver ingenting, returnerar bara vad som skulle hända
 *   korning   länk till flödeskörningen, visas om något går fel
 */
export async function kor({ api, repo, nummer, torrt = false, korning = null, logg = console.log }) {
  const pr = await api('GET', `/repos/${repo}/pulls/${nummer}`);
  // En torrkörning skriver ingenting och får därför titta även på en stängd pull request.
  if (pr.state !== 'open' && !torrt) {
    logg(`Pull request ${nummer} är inte öppen. Inget att göra.`);
    return { hoppad: 'pull requesten är inte öppen' };
  }
  // Läget sitter på en commit. En pull request mot en annan gren får därför inte sätta det:
  // samma commit kan samtidigt vara på väg in i main med en organisation i sig.
  if (pr.base?.ref !== pr.base?.repo?.default_branch) {
    logg(`Pull request ${nummer} går inte mot standardgrenen. Inget läge sätts.`);
    return { hoppad: 'annan basgren än standardgrenen' };
  }
  const sha = pr.head?.sha;
  if (!ID.test(String(sha)) || !ID.test(String(pr.base?.sha))) throw new Error('GitHub gav inget giltigt id för pull requestens commits.');

  try {
    // Var pull requesten grenade av. Båda id:na kommer ur samma läsning, och svaret beror bara på dem.
    const jamforelse = await api('GET', `/repos/${repo}/compare/${pr.base.sha}...${sha}?per_page=1`);
    const bas = await trad(api, repo, jamforelse.merge_base_commit?.sha);
    const huvud = await trad(api, repo, sha);
    const { filer, ogiltiga, regelfiler } = jamforTrad(bas, huvud);
    const lage = { ogiltiga, regelfiler };

    const kommentarer = await allaKommentarer(api, repo, nummer);
    const egen = kommentarer.find(arLista);
    let kropp = egen?.body ?? '';
    // Listan ritas bara om när den ska visa något annat än den gör. Annars skulle den som bockar
    // bli avbruten, och ett intyg skulle sluta gälla utan att något har ändrats.
    if ((filer.length > 0 || ogiltiga.length > 0 || egen) && behoverRitasOm(filer, lage, kropp)) {
      if (filer.length <= MAX_ORGANISATIONER) for (const fil of filer) await lasFil(api, repo, fil);
      kropp = lista(filer, { repo, nummer, ...lage }, kropp);
    }
    const skrivs = kropp !== (egen?.body ?? '');
    const avlast = avlas(filer, kropp, { ogiltiga });

    // Ett intyg behövs först när allt är avbockat. Skrivs listan om nu gäller inget äldre intyg.
    let intyg = { intygadAv: '', intygForaldrat: false };
    if (avlast.totalt > 0 && avlast.klara === avlast.totalt && !avlast.forManga && !ogiltiga.length) {
      intyg = await hittaIntyg(api, repo, kommentarer, skrivs || !egen ? Infinity : Date.parse(egen.updated_at));
    }
    const resultat = utfall(avlast, { ...intyg, regelfiler });
    logg(`${filer.length} organisationsfiler · ${avlast.klara} av ${avlast.totalt} punkter avbockade · ${resultat.state}: ${resultat.description}`);
    if (torrt) return { resultat, kommentar: kropp, lage: avlast };

    let lank = egen?.html_url ?? pr.html_url;
    if (skrivs) {
      const sparad = egen
        ? await api('PATCH', `/repos/${repo}/issues/comments/${egen.id}`, { body: kropp })
        : await api('POST', `/repos/${repo}/issues/${nummer}/comments`, { body: kropp });
      lank = sparad.html_url ?? lank;
    }
    await api('POST', `/repos/${repo}/statuses/${sha}`, { state: resultat.state, context: KONTEXT, description: resultat.description, target_url: lank });
    return { resultat, kommentar: kropp, lage: avlast };
  } catch (fel) {
    // Utan ett läge ser pull requesten ut att sakna kontrollen. Säg hellre att den inte gick att köra.
    if (!torrt) {
      await api('POST', `/repos/${repo}/statuses/${sha}`, {
        state: 'error',
        context: KONTEXT,
        description: 'Kontrollen gick inte att köra. Kör om flödet.',
        target_url: korning ?? pr.html_url,
      }).catch(() => {});
    }
    throw fel;
  }
}
