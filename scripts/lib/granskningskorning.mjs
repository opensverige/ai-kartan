// Körningen bakom granskningslistan: läser en pull request, skriver listan och sätter kontrollens läge.
// Reglerna för hur listan ser ut och läses av står i scripts/lib/granskning.mjs.
//
// Alla anrop till GitHub går genom `api`, som den som anropar skickar in. Då går hela körningen
// att pröva mot ett låtsas-GitHub (scripts/granskningskorning.test.mjs).
//
// Det som körningen ska stå emot:
//   - Innehållet byts efter att någon har bockat av. Därför binds varje bock till filens hela text.
//   - Någon annan än en människa med skrivrätt bockar av. Sådana bockar tas bort igen.
//   - Något går fel på vägen. Då blir läget "error", aldrig grönt, och listan rörs inte.

import YAML from 'yaml';
import { arOrganisationsfil, iOrganisationsmappen, arRegelfil, version, rutor, lista, avlas, utfall, ren, MARKOR, KONTEXT, MAX_ORGANISATIONER } from './granskning.mjs';

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

async function allaSidor(api, stig, maxSidor) {
  const ut = [];
  for (let sida = 1; sida <= maxSidor; sida++) {
    const del = await api('GET', `${stig}?per_page=100&page=${sida}`);
    ut.push(...del);
    if (del.length < 100) return ut;
  }
  return ut;
}

/** Vilka filer pull requesten rör, sorterade i organisationer, otillåtna filer och regelfiler. */
function valj(rader, trad) {
  const filer = new Map();
  const ogiltiga = [];
  let regelfiler = false;
  let stammer = true;
  for (const f of rader) {
    const namn = String(f.filename);
    const gammal = typeof f.previous_filename === 'string' && f.previous_filename !== namn ? f.previous_filename : null;
    if (arRegelfil(namn) || (gammal && arRegelfil(gammal))) regelfiler = true;
    if (f.status === 'removed') {
      // En borttagen fil ska inte finnas kvar i den commit som listan gäller.
      if (trad.has(namn)) stammer = false;
      if (arOrganisationsfil(namn)) filer.set(namn, { sokvag: namn, status: 'removed', ersattAv: null });
      continue;
    }
    if (iOrganisationsmappen(namn)) {
      const post = trad.get(namn);
      // Fillistan och trädet ska visa samma version. Annars har pull requesten ändrats under läsningen.
      if (!post || post.sha !== f.sha) stammer = false;
      else if (!arOrganisationsfil(namn)) ogiltiga.push({ sokvag: namn, skal: 'filnamnet är inte ett id med gemener, siffror och bindestreck följt av .yaml' });
      else if (post.type !== 'blob' || !VANLIG_FIL.has(post.mode)) ogiltiga.push({ sokvag: namn, skal: 'är inte en vanlig fil, till exempel en symbolisk länk' });
      else filer.set(namn, { sokvag: namn, blob: f.sha, status: f.status === 'modified' || f.status === 'changed' ? 'modified' : 'added' });
    }
    // Ett namnbyte tar bort det gamla id:t. Det ska granskaren få se, även om innehållet följer med.
    if (f.status === 'renamed' && gammal && arOrganisationsfil(gammal) && !filer.has(gammal)) {
      filer.set(gammal, { sokvag: gammal, status: 'removed', ersattAv: arOrganisationsfil(namn) ? namn : null });
    }
  }
  return { filer: [...filer.values()].sort((a, b) => a.sokvag.localeCompare(b.sokvag)), ogiltiga, regelfiler, stammer };
}

/** Pull requesten, dess filer och trädet för samma commit. Börjar om ifall de inte hör ihop. */
async function ogonblick(api, repo, nummer, lage) {
  for (let forsok = 1; forsok <= 3; forsok++) {
    const pr = await api('GET', `/repos/${repo}/pulls/${nummer}`);
    lage.sha = pr.head.sha;
    const rader = await allaSidor(api, `/repos/${repo}/pulls/${nummer}/files`, 30);
    const svar = await api('GET', `/repos/${repo}/git/trees/${pr.head.sha}?recursive=1`);
    if (svar.truncated) throw new Error('Kodförrådet är för stort för att läsas i ett svep.');
    const urval = valj(rader, new Map(svar.tree.map((t) => [t.path, t])));
    // GitHub listar högst 3 000 filer. Rör pull requesten fler kan en organisationsfil ha hamnat utanför.
    if (urval.stammer && rader.length >= pr.changed_files) return { pr, sha: pr.head.sha, ...urval };
  }
  throw new Error('Pull requesten ändrades medan den lästes, eller rör fler filer än som går att lista. Kör om flödet.');
}

/** Hämtar filens text och räknar dess version. Texten som visas och texten som bockas av är samma. */
async function lasFil(api, repo, fil) {
  if (fil.status === 'removed') {
    fil.version = version('removed', fil.ersattAv ?? '');
    return;
  }
  if (!/^[0-9a-f]{40}$/.test(String(fil.blob))) throw new Error(`Filen ${fil.sokvag} saknar version hos GitHub.`);
  const blob = await api('GET', `/repos/${repo}/git/blobs/${fil.blob}`);
  if (!(blob.size <= MAX_FILSTORLEK)) {
    fil.fel = 'filen är för stor';
    fil.version = version(fil.status, `för stor ${fil.blob}`);
    return;
  }
  const text = Buffer.from(String(blob.content ?? ''), blob.encoding === 'base64' ? 'base64' : 'utf8').toString('utf8');
  fil.version = version(fil.status, text);
  try {
    fil.data = YAML.parse(text, { maxAliasCount: 50 });
  } catch (fel) {
    fil.fel = fel.message;
  }
}

/** Flödets egen kommentar. Vem som helst kan skriva en kommentar som ser ut som listan, så bara botens räknas. */
async function egenKommentar(api, repo, nummer) {
  for (let sida = 1; sida <= 30; sida++) {
    const del = await api('GET', `/repos/${repo}/issues/${nummer}/comments?per_page=100&page=${sida}`);
    const egen = del.find((k) => k.user?.type === 'Bot' && k.user?.login === BOT && String(k.body).startsWith(MARKOR));
    if (egen) return egen;
    if (del.length < 100) return null;
  }
  throw new Error('Pull requesten har för många kommentarer för att listan ska gå att hitta.');
}

/** Bara en människa som får skriva i repot får bocka av. Går det inte att få svar kastas felet vidare. */
async function farBocka(api, repo, avsandare) {
  if (avsandare?.type !== 'User' || !/^[A-Za-z0-9-]{1,39}$/.test(String(avsandare.login))) return false;
  let ratt;
  try {
    ratt = await api('GET', `/repos/${repo}/collaborators/${avsandare.login}/permission`);
  } catch (fel) {
    // 404 betyder att kontot inte finns bland dem som får bidra. Allt annat är ett fel hos GitHub.
    if (fel.status === 404) return false;
    throw fel;
  }
  return ratt?.user?.type === 'User' && (['admin', 'write'].includes(ratt.permission) || ['admin', 'maintain', 'write'].includes(ratt.role_name));
}

/**
 * Kör granskningen för en pull request.
 *   handelse    pull_request_target, issue_comment eller workflow_dispatch
 *   avsandare   { login, type } för den som redigerade kommentaren (issue_comment)
 *   redigering  { kommentarId, fore, efter } för den redigerade kommentaren (issue_comment)
 *   torrt       skriver ingenting, returnerar bara vad som skulle hända
 *   korning     länk till flödeskörningen, visas om något går fel
 */
export async function kor({ api, repo, nummer, handelse = 'workflow_dispatch', avsandare = null, redigering = null, torrt = false, korning = null, logg = console.log }) {
  const forst = await api('GET', `/repos/${repo}/pulls/${nummer}`);
  // En torrkörning skriver ingenting och får därför titta även på en stängd pull request.
  if (forst.state !== 'open' && !torrt) {
    logg(`Pull request ${nummer} är inte öppen. Inget att göra.`);
    return { hoppad: 'pull requesten är inte öppen' };
  }
  // Läget sitter på en commit. En pull request mot en annan gren får därför inte sätta det:
  // samma commit kan samtidigt vara på väg in i main med en organisation i sig.
  if (forst.base?.ref !== forst.base?.repo?.default_branch) {
    logg(`Pull request ${nummer} går inte mot standardgrenen. Inget läge sätts.`);
    return { hoppad: 'annan basgren än standardgrenen' };
  }

  const lage = { sha: forst.head.sha };
  try {
    const { pr, sha, filer, ogiltiga, regelfiler } = await ogonblick(api, repo, nummer, lage);
    if (filer.length <= MAX_ORGANISATIONER) for (const fil of filer) await lasFil(api, repo, fil);

    const egen = await egenKommentar(api, repo, nummer);
    let vem = '';
    let avvisad = null;
    const bort = [];
    if (handelse === 'issue_comment' && egen && redigering && redigering.kommentarId === egen.id) {
      if (await farBocka(api, repo, avsandare)) vem = avsandare.login;
      else {
        // Det den här redigeringen bockade av räknas inte. Det som redan var avbockat står kvar.
        const fore = rutor(redigering.fore);
        for (const [markor, pa] of rutor(redigering.efter)) if (pa !== false && !fore.get(markor)) bort.push(markor);
        avvisad = ren(avsandare?.login, 60) || 'ett okänt konto';
      }
    }

    // Listan skrivs alltid om ur filerna. Avbockade punkter följer med om filens text är densamma.
    const visa = filer.length > 0 || ogiltiga.length > 0 || Boolean(egen);
    const ny = visa ? lista(filer, { repo, sha, nummer, ogiltiga }, egen?.body ?? '', { bort }) : '';
    const avlast = avlas(filer, ny, { ogiltiga });
    const resultat = utfall(avlast, vem, { regelfiler });
    logg(`${filer.length} organisationsfiler · ${avlast.klara} av ${avlast.totalt} punkter avbockade · ${resultat.state}: ${resultat.description}`);
    if (torrt) return { resultat, kommentar: ny, lage: avlast };

    let lank = egen?.html_url ?? pr.html_url;
    if (ny && ny !== egen?.body) {
      const sparad = egen
        ? await api('PATCH', `/repos/${repo}/issues/comments/${egen.id}`, { body: ny })
        : await api('POST', `/repos/${repo}/issues/${nummer}/comments`, { body: ny });
      lank = sparad.html_url ?? lank;
    }
    if (avvisad) {
      await api('POST', `/repos/${repo}/issues/${nummer}/comments`, {
        body: `En redigering av granskningslistan av \`${avvisad}\` räknades inte. Bara en människa med skrivrätt i repot får bocka av, aldrig en bot eller en AI-agent. Det den redigeringen bockade av är urbockat igen.`,
      });
    }
    await api('POST', `/repos/${repo}/statuses/${sha}`, { state: resultat.state, context: KONTEXT, description: resultat.description, target_url: lank });
    return { resultat, kommentar: ny, lage: avlast };
  } catch (fel) {
    // Utan ett läge ser pull requesten ut att sakna kontrollen. Säg hellre att den inte gick att köra.
    if (!torrt) {
      await api('POST', `/repos/${repo}/statuses/${lage.sha}`, {
        state: 'error',
        context: KONTEXT,
        description: 'Kontrollen gick inte att köra. Kör om flödet.',
        target_url: korning ?? forst.html_url,
      }).catch(() => {});
    }
    throw fel;
  }
}
