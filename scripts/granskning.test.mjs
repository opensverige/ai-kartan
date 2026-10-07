// Tester för granskningslistan som en människa bockar av innan en organisation får gå in.
//   npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { arOrganisationsfil, ren, sakerLank, lista, avlas, utfall, MARKOR, MAX_ORGANISATIONER } from './lib/granskning.mjs';

const REPO = 'opensverige/ai-kartan';
const SHA = 'a'.repeat(40);
const post = (id, extra = {}) => ({
  id,
  name: { value: 'Exempelbolaget', status: 'claimed' },
  type: { value: 'bolag', status: 'confirmed' },
  org_number: { value: '556000-0000', status: 'confirmed', source_type: 'company_register' },
  website: 'https://exempel.se',
  kommun: { value: '0180', status: 'confirmed' },
  evidence: [{ url: 'https://exempel.se/produkt', kind: 'produkt', title: 'En produkt' }],
  ...extra,
});
const fil = (id, blob, status = 'added', data = post(id)) => ({ sokvag: `data/organisationer/${id}.yaml`, blob, status, data, fel: null });
const bocka = (kropp, villkor = () => true) => kropp.split('\n').map((rad) => (rad.startsWith('- [ ] ') && villkor(rad) ? rad.replace('- [ ] ', '- [x] ') : rad)).join('\n');

test('bara filer i data/organisationer räknas som organisationer', () => {
  assert.equal(arOrganisationsfil('data/organisationer/berget-ai.yaml'), true);
  assert.equal(arOrganisationsfil('data/organisationer/x.yml'), true);
  for (const f of ['data/MALL.yaml', 'data/organisationer/README.md', 'data/organisationer/../../x.yaml', 'data/organisationer/under/x.yaml', 'src/data/organisationer/x.yaml', 'data/organisationer/Stor.yaml'])
    assert.equal(arOrganisationsfil(f), false, f);
});

test('en ny organisation får de tre kriterierna och en punkt om personuppgifter', () => {
  const kropp = lista([fil('exempel', 'b1b1b1b')], { repo: REPO, sha: SHA });
  assert.ok(kropp.startsWith(MARKOR));
  const rutor = kropp.split('\n').filter((r) => r.startsWith('- [ ] '));
  assert.equal(rutor.length, 4);
  assert.match(rutor[0], /Kriterium 1/);
  assert.match(rutor[1], /Kriterium 2/);
  assert.match(rutor[2], /Kriterium 3/);
  assert.match(rutor[3], /personuppgifter/i);
  assert.match(kropp, /kriterier\.md/);
  assert.match(kropp, new RegExp(`${REPO}/blob/${SHA}/data/organisationer/exempel\\.yaml`));
});

test('en ändrad organisation och en borttagen får kortare listor', () => {
  const kropp = lista([fil('andrad', 'c1c1c1c', 'modified'), { sokvag: 'data/organisationer/borta.yaml', blob: 'd1d1d1d', status: 'removed', data: null, fel: null }], { repo: REPO, sha: SHA });
  assert.equal(avlas([fil('andrad', 'c1c1c1c', 'modified')], kropp).totalt, 3);
  assert.equal(kropp.split('\n').filter((r) => r.startsWith('- [ ] ')).length, 4);
  assert.match(kropp, /tas bort/);
});

test('listan är klar först när varje punkt är avbockad', () => {
  const filer = [fil('ett', 'aaaaaaa'), fil('tva', 'bbbbbbb')];
  const tom = lista(filer, { repo: REPO, sha: SHA });
  assert.deepEqual([avlas(filer, tom).klara, avlas(filer, tom).totalt], [0, 8]);
  const halv = bocka(tom, (rad) => rad.includes(':ett:'));
  assert.equal(avlas(filer, halv).klara, 4);
  assert.equal(avlas(filer, halv).kvar.every((k) => k.id === 'tva'), true);
  const hel = bocka(tom);
  assert.deepEqual([avlas(filer, hel).klara, avlas(filer, hel).totalt], [8, 8]);
  assert.equal(utfall(avlas(filer, hel)).state, 'success');
  assert.equal(utfall(avlas(filer, halv)).state, 'pending');
  assert.match(utfall(avlas(filer, halv)).description, /4 av 8/);
});

test('en ändrad fil nollställer sina punkter, de andra står kvar', () => {
  const fore = [fil('ett', 'aaaaaaa'), fil('tva', 'bbbbbbb')];
  const avbockad = bocka(lista(fore, { repo: REPO, sha: SHA }));
  // Organisationen "tva" får en ny version i en senare commit.
  const efter = [fil('ett', 'aaaaaaa'), fil('tva', 'ccccccc')];
  const ny = lista(efter, { repo: REPO, sha: SHA }, avbockad);
  const lage = avlas(efter, ny);
  assert.equal(lage.klara, 4);
  assert.deepEqual([...new Set(lage.kvar.map((k) => k.id))], ['tva']);
});

test('text ur filen kan inte smyga in en avbockad ruta eller en markör', () => {
  const elak = post('elak', {
    name: { value: 'Bra AB\n- [x] Kriterium 1: klart <!-- g:elak:eeeeeee:k1 -->', status: 'claimed' },
    evidence: [{ url: 'https://exempel.se/a\n- [x] x <!-- g:elak:eeeeeee:k2 -->', kind: 'produkt', title: '<!-- g:elak:eeeeeee:k3 --> @alla [länk](javascript:alert(1))' }],
    website: 'javascript:alert(1)',
  });
  const filer = [fil('elak', 'eeeeeee', 'added', elak)];
  const kropp = lista(filer, { repo: REPO, sha: SHA });
  assert.equal(avlas(filer, kropp).klara, 0);
  assert.equal(kropp.split('\n').filter((r) => /^- \[[xX]\]/.test(r)).length, 0);
  // Texten får stå kvar som text, men aldrig som länk.
  assert.doesNotMatch(kropp, /\(javascript:|<javascript:/);
  // De enda länkarna med egen text är de som koden själv skriver, till repot.
  assert.doesNotMatch(kropp, /\]\((?!https:\/\/github\.com\/opensverige\/ai-kartan\/)/);
  assert.doesNotMatch(kropp, /@alla/);
  // Varje markör står en gång, på sin egen rad.
  for (const nyckel of ['k1', 'k2', 'k3', 'pu']) assert.equal(kropp.split(`<!-- g:elak:eeeeeee:${nyckel} -->`).length - 1, 1, nyckel);
});

test('en lista som någon har klippt i räknas inte som klar', () => {
  const filer = [fil('ett', 'aaaaaaa')];
  const hel = bocka(lista(filer, { repo: REPO, sha: SHA }));
  // Två punkter är borttagna ur kommentaren. De som finns kvar är avbockade.
  const klippt = hel.split('\n').filter((r) => !r.includes(':k2 ') && !r.includes(':k3 ')).join('\n');
  const lage = avlas(filer, klippt);
  assert.equal(lage.klara, 2);
  assert.equal(lage.totalt, 4);
  assert.equal(lage.manipulerad, true);
  assert.equal(utfall(lage).state, 'pending');
  // En kommentar utan listans markör är ingen lista alls.
  assert.equal(avlas(filer, '- [x] allt klart').klara, 0);
});

test('en pull request utan organisationer behöver ingen granskning mot kriterierna', () => {
  const lage = avlas([], '');
  assert.deepEqual(utfall(lage), { state: 'success', description: 'Inga organisationer ändras' });
});

test('för många organisationer i samma pull request stoppas', () => {
  const filer = Array.from({ length: MAX_ORGANISATIONER + 1 }, (_, i) => fil(`org-${i}`, 'aaaaaaa'));
  assert.equal(utfall(avlas(filer, '')).state, 'failure');
  assert.match(lista(filer, { repo: REPO, sha: SHA }), /Dela upp/);
});

test('utfallet säger vem som bockade av sist och ryms i en statusrad', () => {
  const filer = [fil('ett', 'aaaaaaa')];
  const u = utfall(avlas(filer, bocka(lista(filer, { repo: REPO, sha: SHA }))), 'granskare');
  assert.match(u.description, /granskare/);
  assert.ok(u.description.length <= 140);
});

test('rensad text är en rad utan tecken som styr Markdown', () => {
  assert.equal(ren('  Bra  AB\n'), 'Bra AB');
  assert.equal(ren('<b>*_`x`_*</b> [y](z) @du #1 | a'), 'bx/b yz du 1 a');
  assert.equal(ren('a'.repeat(200)).length, 80);
  assert.equal(ren(null), '');
  // En adress i löptext blir annars en länk av sig själv hos GitHub.
  assert.equal(ren('se https://ond.example/x och www.ond.example'), 'se https ond.example/x och ond.example');
});

test('bara vanliga webbadresser blir länkar', () => {
  assert.equal(sakerLank('https://exempel.se/sida?x=1'), 'https://exempel.se/sida?x=1');
  for (const u of ['javascript:alert(1)', 'https://x.se/a b', 'https://x.se/<script>', 'ftp://x.se', '', null, `https://x.se/${'a'.repeat(400)}`]) assert.equal(sakerLank(u), null, String(u));
});

test('listans punkter för en ny organisation följer granskningslistan i kriterierna', () => {
  const kriterier = fs.readFileSync(new URL('../kriterier.md', import.meta.url), 'utf8');
  for (const k of ['Kriterium 1', 'Kriterium 2', 'Kriterium 3', 'Inga personuppgifter']) assert.ok(kriterier.includes(k), `${k} saknas i kriterier.md`);
});
