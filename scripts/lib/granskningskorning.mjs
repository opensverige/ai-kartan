// Körningen bakom granskningslistan: läser en pull request, skriver listan och sätter kontrollens läge.
// Reglerna för hur listan ser ut och läses av står i scripts/lib/granskning.mjs.
//
// Alla anrop till GitHub går genom `api` och allt som git räknar ut genom `git`. Båda skickas in
// av den som anropar. Då går hela körningen att pröva mot ett låtsas-GitHub ovanpå ett riktigt
// git-förråd (scripts/granskningskorning.test.mjs).
//
// Körningen minns ingenting mellan gångerna och bryr sig inte om vilken händelse som startade den.
// Varje gång räknar den ut läget på nytt:
//
//   - Vilka organisationer som ändras är skillnaden mellan main som den är just nu och det main
//     skulle bli om pull requesten slogs ihop nu. Sammanslagningen räknas ut med git självt, se
//     scripts/lib/granskningsgit.mjs. Listan visar alltså det som faktiskt går in, också när main
//     har flyttat sig sedan grenen skapades. Läget sätts på den commit som slogs ihop i uträkningen.
//   - Vilka punkter som är avbockade står i flödets egen kommentar.
//   - Att en människa har gått igenom listan intygas i en egen kommentar, skriven av någon med
//     skrivrätt, aldrig redigerad och nyare än listans senaste ändring. En bot kan kryssa i en
//     ruta, men den kan inte skriva en kommentar i en människas namn utan att GitHub märker ut
//     kommentaren som skriven genom en app, och sådana räknas inte.
//
// Går något fel blir läget "error", aldrig grönt, och listan rörs inte.

import { tolkaYaml } from './organisationer.mjs';
import { GitFel } from './granskningsgit.mjs';
import { arOrganisationsfil, iOrganisationsmappen, arRegelfil, version, lista, avlas, utfall, behoverRitasOm, arIntyg, MARKOR, KONTEXT, MAPP, MAX_ORGANISATIONER } from './granskning.mjs';

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
/** Fler commits än så här i en gren spelas inte upp en och en. */
const MAX_COMMITS = 100;

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
 * Vad som skiljer två träd åt. `bas` är main, `ihop` är main med pull requesten sammanslagen och
 * `huvud` är pull requestens eget träd. Alla tre är rader ur git, se `rader` i granskningsgit.mjs.
 * Svaret är organisationsfilerna som ändras, det som inte får ligga i mappen, och om någon
 * regelfil ändras.
 */
export function jamforTrad(bas, ihop, huvud = ihop) {
  const blad = (rader) => new Map(rader.filter((t) => t.type !== 'tree').map((t) => [t.path, t]));
  const samma = (a, b) => Boolean(a && b) && a.sha === b.sha && a.mode === b.mode && a.type === b.type;
  const fore = blad(bas);
  const efter = blad(ihop);
  const egen = blad(huvud);
  const filer = [];
  const ogiltiga = [];
  let regelfiler = false;
  for (const sokvag of new Set([...fore.keys(), ...efter.keys()])) {
    const g = fore.get(sokvag);
    const h = efter.get(sokvag);
    if (samma(g, h)) continue;
    if (arRegelfil(sokvag)) regelfiler = true;
    if (!iOrganisationsmappen(sokvag)) continue;
    if (!h) {
      if (arOrganisationsfil(sokvag)) filer.push({ sokvag, status: 'removed', basblob: g.sha });
    } else if (!arOrganisationsfil(sokvag)) ogiltiga.push({ sokvag, skal: 'filnamnet är inte ett id med gemener, siffror och bindestreck följt av .yaml' });
    else if (h.type !== 'blob' || !VANLIG_FIL.has(h.mode)) ogiltiga.push({ sokvag, skal: 'är inte en vanlig fil, till exempel en symbolisk länk' });
    else if (!(h.size <= MAX_FILSTORLEK)) ogiltiga.push({ sokvag, skal: 'filen är för stor för att vara en organisation' });
    // Skiljer sig filen från grenens egen har main ändrat i den också, och git har slagit ihop de två.
    else filer.push({ sokvag, status: g ? 'modified' : 'added', blob: h.sha, basblob: g?.type === 'blob' ? g.sha : null, blandad: !samma(h, egen.get(sokvag)) });
  }
  // Mappen själv, eller mappen den ligger i, kan vara utbytt mot en länk, en fil eller ett annat
  // kodförråd. Då finns inga filer att lista, och det är det som ska sägas.
  for (const mapp of MAPP.split('/').map((_, i, delar) => delar.slice(0, i + 1).join('/'))) {
    if (efter.has(mapp) && !samma(fore.get(mapp), efter.get(mapp))) {
      return { filer: [], ogiltiga: [{ sokvag: mapp, skal: 'är inte längre en vanlig mapp, utan till exempel en symbolisk länk', mapp: true }], regelfiler };
    }
  }
  for (const fil of filer) {
    fil.version = fil.status === 'removed' ? version('removed', '') : version(fil.status, fil.status === 'modified' ? `${fil.basblob}\n${fil.blob}` : fil.blob);
  }
  const efterNamn = (a, b) => a.sokvag.localeCompare(b.sokvag);
  return { filer: filer.sort(efterNamn), ogiltiga: ogiltiga.sort(efterNamn), regelfiler };
}

/** Den senaste commiten i en gren, läst just nu. */
async function spets(api, repo, gren) {
  const svar = await api('GET', `/repos/${repo}/git/ref/heads/${String(gren).split('/').map(encodeURIComponent).join('/')}`);
  if (svar?.ref !== `refs/heads/${gren}` || svar.object?.type !== 'commit' || !ID.test(String(svar.object?.sha))) throw new Error('GitHub gav inget giltigt id för grenens senaste commit.');
  return svar.object.sha;
}

/**
 * Det som hindrar en granskning, som en rad att visa i läget, eller null.
 *
 * Listan visar vad en sammanslagning ger: det är vad Create a merge commit och Squash and merge
 * för in i main. Rebase and merge gör något annat. Den spelar upp grenens vanliga commits en och
 * en ovanpå main och hoppar över dess sammanslagningar. Två commits som tar ut varandra när de
 * slås ihop tillsammans behöver inte göra det en och en: har main redan samma ändring som den
 * första gör den ingenting, och den andra går in ensam. Det en sammanslagning i grenen har ändrat
 * för hand följer inte heller med.
 *
 * Därför spelas commiterna upp här på samma sätt, och resultatet i mappen med organisationer
 * jämförs med sammanslagningens. Skiljer de sig åt går listan inte att lita på för alla sätt att
 * slå ihop, och läget blir rött.
 */
async function hinderIHistoriken(git, bas, sha, ihop) {
  const commits = await git.commits(bas, sha, MAX_COMMITS + 1);
  if (commits.length > MAX_COMMITS) return 'Grenen har för många commits för att prövas en och en. Slå ihop dem till färre.';
  let trad = bas;
  for (const c of commits) {
    // En commit utan förälder börjar en egen historik. Den går inte att spela upp som en ändring.
    if (!c.foralder) return 'Grenen innehåller en historik utan gemensam början med main. Gör om grenen från main.';
    // En konflikt här lämnar konfliktmarkeringar i trädet. Sitter de i en organisation syns det i jämförelsen nedan.
    trad = (await git.spelaUpp(trad, c.sha, c.foralder)).trad;
  }
  if ((await git.mapp(trad, MAPP)) !== (await git.mapp(ihop, MAPP))) {
    return 'Grenens commits ger ett annat resultat en och en än tillsammans. Slå ihop dem till en commit, så räknas listan om.';
  }
  return null;
}

/** Hämtar filens text, samma version som markören gäller, och tolkar den som bygget gör. */
async function lasFil(git, fil) {
  if (fil.status === 'removed' || fil.data !== undefined || fil.fel) return;
  if (!ID.test(String(fil.blob))) throw new Error(`Filen ${fil.sokvag} saknar version hos git.`);
  try {
    fil.data = tolkaYaml(await git.text(fil.blob));
  } catch (fel) {
    if (fel instanceof GitFel) throw fel;
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
    // En kommentar som en app har skrivit åt en människa bär appens namn här. Den räknas inte.
    .filter((k) => k.user?.type === 'User' && !k.performed_via_github_app && arIntyg(k.body) && k.created_at && k.created_at === k.updated_at)
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
 * Sätter läget på en commit, om det inte redan står där. GitHub tar emot högst tusen lägen per
 * commit och namn, och en körning som inget ändrar ska inte förbruka dem.
 */
async function skrivLage(api, repo, sha, lage) {
  const tidigare = await api('GET', `/repos/${repo}/commits/${sha}/statuses?per_page=100`);
  const senast = Array.isArray(tidigare) ? tidigare.find((s) => s.context === KONTEXT) : null;
  if (senast && senast.state === lage.state && senast.description === lage.description && senast.target_url === lage.target_url) return;
  await api('POST', `/repos/${repo}/statuses/${sha}`, { ...lage, context: KONTEXT });
}

/**
 * Kör granskningen för en pull request.
 *   git       ett förråd att räkna i, se scripts/lib/granskningsgit.mjs
 *   torrt     skriver ingenting, returnerar bara vad som skulle hända
 *   korning   länk till flödeskörningen, visas om något går fel
 */
export async function kor({ api, git, repo, nummer, torrt = false, korning = null, logg = console.log }) {
  const pr = await api('GET', `/repos/${repo}/pulls/${nummer}`);
  // En torrkörning skriver ingenting och får därför titta även på en stängd pull request.
  if (pr.state !== 'open' && !torrt) {
    logg(`Pull request ${nummer} är inte öppen. Inget att göra.`);
    return { hoppad: 'pull requesten är inte öppen' };
  }
  // Läget sitter på en commit. En pull request mot en annan gren får därför inte sätta det:
  // samma commit kan samtidigt vara på väg in i main med en organisation i sig.
  const gren = pr.base?.ref;
  if (!gren || gren !== pr.base?.repo?.default_branch) {
    logg(`Pull request ${nummer} går inte mot standardgrenen. Inget läge sätts.`);
    return { hoppad: 'annan basgren än standardgrenen' };
  }
  const sha = pr.head?.sha;
  if (!ID.test(String(sha))) throw new Error('GitHub gav inget giltigt id för pull requestens senaste commit.');

  try {
    // Main kan flytta sig och listan kan ändras medan körningen arbetar. Båda läses därför om
    // precis före skrivningen, och har något ändrats börjar räkningen om från början.
    for (let forsok = 1; ; forsok++) {
      const omIgen = (vad) => {
        if (forsok >= 3) throw new Error(`${vad} ändrades gång på gång medan läget räknades ut.`);
      };
      // Mains senaste commit läses här, inte ur pull requesten: commiten som en pull request
      // sägs utgå från flyttas inte hos GitHub när main flyttas.
      const bas = await spets(api, repo, gren);
      const oforandrad = async () => torrt || (await spets(api, repo, gren)) === bas;
      await git.hamta([bas, sha]);
      const ihop = await git.slaIhop(bas, sha);
      const hinder = ihop.konflikt ? 'Grenen går inte att slå ihop med main utan konflikter. Lös dem, så räknas listan om.' : await hinderIHistoriken(git, bas, sha, ihop.trad);
      if (hinder) {
        logg(`Går inte att granska: ${hinder}`);
        const resultat = { state: 'failure', description: hinder };
        if (torrt) return { resultat, kommentar: '', lage: null };
        if (!(await oforandrad())) {
          omIgen('Main');
          continue;
        }
        await skrivLage(api, repo, sha, { ...resultat, target_url: pr.html_url });
        return { resultat, kommentar: '', lage: null };
      }
      const { filer, ogiltiga, regelfiler } = jamforTrad(await git.rader(bas), await git.rader(ihop.trad), await git.rader(sha));
      const lage = { ogiltiga, regelfiler };

      const kommentarer = await allaKommentarer(api, repo, nummer);
      const egen = kommentarer.find(arLista);
      let kropp = egen?.body ?? '';
      // Listan ritas bara om när den ska visa något annat än den gör. Annars skulle den som bockar
      // bli avbruten, och ett intyg skulle sluta gälla utan att något har ändrats.
      if ((filer.length > 0 || ogiltiga.length > 0 || egen) && behoverRitasOm(filer, lage, kropp)) {
        if (filer.length <= MAX_ORGANISATIONER) for (const fil of filer) await lasFil(git, fil);
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

      if (!(await oforandrad())) {
        omIgen('Main');
        continue;
      }
      let lank = egen?.html_url ?? pr.html_url;
      if (skrivs && egen) {
        const nu = await api('GET', `/repos/${repo}/issues/comments/${egen.id}`);
        if (nu.body !== egen.body) {
          omIgen('Listan');
          continue;
        }
        lank = (await api('PATCH', `/repos/${repo}/issues/comments/${egen.id}`, { body: kropp })).html_url ?? lank;
      } else if (skrivs) {
        lank = (await api('POST', `/repos/${repo}/issues/${nummer}/comments`, { body: kropp })).html_url ?? lank;
      }
      await skrivLage(api, repo, sha, { state: resultat.state, description: resultat.description, target_url: lank });
      return { resultat, kommentar: kropp, lage: avlast };
    }
  } catch (fel) {
    // Utan ett läge ser pull requesten ut att sakna kontrollen. Säg hellre att den inte gick att köra.
    if (!torrt) {
      await skrivLage(api, repo, sha, { state: 'error', description: 'Kontrollen gick inte att köra. Kör om flödet.', target_url: korning ?? pr.html_url }).catch(() => {});
    }
    throw fel;
  }
}
