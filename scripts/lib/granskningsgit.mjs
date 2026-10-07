// Git åt granskningen: räknar ut vad en pull request skulle ändra i main om den slogs ihop nu.
//
// GitHubs egna uppgifter räcker inte till det. Commiten som en pull request sägs utgå från flyttas
// inte när main flyttas, och provsammanslagningen som GitHub håller görs inte om för varje ny
// commit i main. Därför hämtas de två commiterna hit och slås ihop med git självt, med samma
// metod som GitHub använder när någon trycker på Merge.
//
// Inget ur pull requesten körs. Förrådet är naket: det har ingen arbetskatalog, inga filer
// checkas ut, och varken krokar, filter eller attribut ur pull requesten läses. Git får bara
// id:n som är fyrtio hexadecimala tecken, aldrig namn eller text som någon annan har valt.

import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { devNull, tmpdir } from 'node:os';
import { join } from 'node:path';

const ID = /^[0-9a-f]{40}$/;
const MAX_UT = 64 * 1024 * 1024;

/** Git svarade med ett fel. `kod` är slutkoden. */
export class GitFel extends Error {
  constructor(vad, kod, text = '') {
    super(`git ${vad} misslyckades (${kod})${text ? `: ${text}` : ''}`);
    this.kod = kod;
  }
}

function id(varde) {
  if (!ID.test(String(varde))) throw new Error('Det som skulle vara ett id hos git är inte det.');
  return varde;
}

/**
 * Ett naket git-förråd i `katalog`, redan skapat.
 *   kalla   adressen att hämta commits från. Utan den förutsätts de redan finnas i förrådet.
 *   token   skickas bara till `kalla`, och aldrig på kommandoraden.
 */
export function oppna(katalog, { kalla = null, token = '' } = {}) {
  // Git får en egen, tom miljö. Inställningar på datorn ska inte kunna ändra resultatet, och
  // inget ur körningens miljö följer med.
  const miljo = { PATH: process.env.PATH ?? '', HOME: katalog, LC_ALL: 'C', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: devNull, GIT_ATTR_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' };

  /** Kör git och ger slutkod och utskrift. Andra slutkoder än 0 och de i `godtagna` är fel. */
  function git(arg, { godtagna = [], extra = {} } = {}) {
    return new Promise((klar, fel) => {
      execFile('git', arg, { cwd: katalog, env: { ...miljo, ...extra }, encoding: 'buffer', maxBuffer: MAX_UT, timeout: 5 * 60_000 }, (e, ut, felut) => {
        if (!e) return klar({ kod: 0, ut });
        if (typeof e.code === 'number' && godtagna.includes(e.code)) return klar({ kod: e.code, ut });
        // Felutskriften kan innehålla filnamn ur pull requesten. Den hamnar i körningens logg, aldrig i en kommentar.
        fel(new GitFel(arg[0], e.code ?? e.signal ?? 'okänt', String(felut ?? '').trim().split('\n')[0].slice(0, 200)));
      });
    });
  }

  return {
    /** Ser till att commiterna finns i förrådet, med hela sin historik. */
    async hamta(ids) {
      ids.forEach(id);
      if (kalla) {
        if (new URL(kalla).protocol !== 'https:') throw new Error('Commits hämtas bara över https.');
        const inloggning = token ? { GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: `http.${new URL(kalla).origin}/.extraheader`, GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${token}`).toString('base64')}` } : {};
        await git(['-c', 'protocol.allow=never', '-c', 'protocol.https.allow=always', 'fetch', '--quiet', '--no-tags', '--no-recurse-submodules', '--no-write-fetch-head', kalla, ...ids], { extra: inloggning });
      }
      // Misslyckas om någon av dem saknas eller inte är en commit.
      await git(['rev-list', '--no-walk', ...ids]);
    },

    /**
     * Slår ihop två commits utan att röra någon gren. Svaret är trädet som sammanslagningen ger
     * och om den gick ihop utan konflikter. Vid en konflikt innehåller trädet konfliktmarkeringar.
     */
    async slaIhop(bas, huvud) {
      const { kod, ut } = await git(['merge-tree', '--write-tree', '--no-messages', id(bas), id(huvud)], { godtagna: [1] });
      return { trad: id(ut.toString('utf8').split('\n')[0].trim()), konflikt: kod !== 0 };
    },

    /** Alla filer i ett träd eller en commit, som rader med sökväg, filtyp, id och storlek. */
    async rader(trad) {
      const { ut } = await git(['ls-tree', '-r', '-l', '-z', '--full-tree', id(trad)]);
      return ut
        .toString('utf8')
        .split('\0')
        .filter(Boolean)
        .map((rad) => {
          const tabb = rad.indexOf('\t');
          const [mode, type, sha, storlek] = rad.slice(0, tabb).split(/ +/);
          return { path: rad.slice(tabb + 1), mode, type, sha, size: type === 'blob' ? Number(storlek) : null };
        });
    },

    /** En fils innehåll som text. */
    async text(blob) {
      return (await git(['cat-file', 'blob', id(blob)])).ut.toString('utf8');
    },

    /** Sammanslagningarna som finns i `huvud` men inte i `bas`, med sina föräldrar. Högst `max` stycken. */
    async sammanslagningar(bas, huvud, max) {
      const { ut } = await git(['rev-list', '--merges', '--parents', `--max-count=${Number(max)}`, `${id(bas)}..${id(huvud)}`]);
      return ut
        .toString('utf8')
        .split('\n')
        .filter(Boolean)
        .map((rad) => rad.split(' '))
        .map(([sha, ...foraldrar]) => ({ sha, foraldrar }));
    },

    /** Id:t för en mapp i ett träd eller en commit, eller null om där inte finns någon mapp. */
    async mapp(trad, stig) {
      if (!/^[a-z]+(\/[a-z]+)*$/.test(stig)) throw new Error('Ogiltig mapp.');
      // -d visar bara mappar. En fil eller en länk med samma namn ger alltså inget svar.
      const { ut } = await git(['ls-tree', '-d', '-z', '--full-tree', id(trad), '--', stig]);
      const rad = ut.toString('utf8').split('\0')[0];
      if (!rad) return null;
      const [, typ, sha] = rad.split('\t')[0].split(/ +/);
      if (typ !== 'tree') throw new Error('Git svarade med något annat än en mapp.');
      return id(sha);
    },
  };
}

/** Ett tomt, naket förråd i en tillfällig mapp. `stang` tar bort det. */
export async function tillfalligt(installningar = {}) {
  const katalog = await mkdtemp(join(process.env.RUNNER_TEMP || tmpdir(), 'granskning-'));
  await new Promise((klar, fel) => execFile('git', ['init', '--quiet', '--bare', katalog], { env: { PATH: process.env.PATH ?? '', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: devNull } }, (e) => (e ? fel(new GitFel('init', e.code ?? 'okänt')) : klar())));
  return { git: oppna(katalog, installningar), katalog, stang: () => rm(katalog, { recursive: true, force: true }) };
}
