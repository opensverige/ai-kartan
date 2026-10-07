// Tester för granskningslistan som en människa bockar av innan en organisation får gå in.
//   npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { arOrganisationsfil, arRegelfil, ren, sakerLank, version, rutor, lista, avlas, utfall, forvantade, avtryck, behoverRitasOm, arIntyg, MARKOR, MAX_ORGANISATIONER, MAX_BYTE, PUNKTER, INTYG } from './lib/granskning.mjs';

const REPO = 'opensverige/ai-kartan';
const HAR = { repo: REPO, nummer: 7 };
const post = (id, extra = {}) => ({
  id,
  name: { value: 'Exempelbolaget', status: 'claimed' },
  type: { value: 'bolag', status: 'confirmed' },
  org_number: { value: '556000-0000', status: 'confirmed', source_type: 'company_register', source_url: 'https://register.example/556000' },
  website: 'https://exempel.se',
  description: { value: 'Bygger en tjänst som sorterar ärenden med en språkmodell.', status: 'claimed' },
  kommun: { value: '0180', status: 'confirmed' },
  evidence: [{ url: 'https://exempel.se/produkt', kind: 'produkt', title: 'En produkt' }],
  ...extra,
});
/** En organisationsfil så som körningen lämnar den till listan. `innehall` står för filens text. */
const fil = (id, innehall, status = 'added', data = post(id)) => ({ sokvag: `data/organisationer/${id}.yaml`, status, version: version(status, innehall), data, fel: null });
const borttagen = (id) => ({ sokvag: `data/organisationer/${id}.yaml`, status: 'removed', version: version('removed', ''), data: null, fel: null });
const bocka = (kropp, villkor = () => true) => kropp.split('\n').map((rad) => (rad.startsWith('- [ ] ') && villkor(rad) ? rad.replace('- [ ] ', '- [x] ') : rad)).join('\n');
const tomma = (kropp) => kropp.split('\n').filter((r) => r.startsWith('- [ ] '));

test('bara filer i data/organisationer räknas som organisationer', () => {
  assert.equal(arOrganisationsfil('data/organisationer/berget-ai.yaml'), true);
  assert.equal(arOrganisationsfil('data/organisationer/x.yml'), true);
  for (const f of ['data/MALL.yaml', 'data/organisationer/README.md', 'data/organisationer/../../x.yaml', 'data/organisationer/under/x.yaml', 'src/data/organisationer/x.yaml', 'data/organisationer/Stor.yaml'])
    assert.equal(arOrganisationsfil(f), false, f);
});

test('listans punkter för en ny organisation är granskningslistan i kriterier.md, ord för ord', () => {
  const kriterier = fs.readFileSync(new URL('../kriterier.md', import.meta.url), 'utf8');
  const avsnitt = kriterier.split('## Granskningslista')[1];
  assert.ok(avsnitt, 'kriterier.md saknar rubriken Granskningslista');
  const rader = avsnitt.split('\n').filter((r) => r.startsWith('- [ ] ')).map((r) => r.slice(6).trim());
  // Sista punkten i kriterier.md är att valideringen är grön. Den prövar CI, inte en ruta.
  assert.match(rader.at(-1), /npm run validera/);
  assert.deepEqual(PUNKTER.ny.map(([, text]) => text), rader.slice(0, -1));
});

test('en ny organisation får en ruta per punkt i granskningslistan', () => {
  const filer = [fil('exempel', 'A')];
  const kropp = lista(filer, HAR);
  assert.ok(kropp.startsWith(MARKOR));
  assert.equal(tomma(kropp).length, PUNKTER.ny.length);
  assert.equal(avlas(filer, kropp).totalt, 6);
  assert.match(kropp, /kriterier\.md/);
  // Länken går till pull requestens egen vy av filen. Listan beror då inte på vilken commit som är sist.
  const ankare = createHash('sha256').update('data/organisationer/exempel.yaml').digest('hex');
  assert.ok(kropp.includes(`[Filen i pull requesten](https://github.com/${REPO}/pull/7/files#diff-${ankare})`));
  assert.doesNotMatch(kropp, /\/blob\/[0-9a-f]{40}\//);
  // Listan säger hur den blir grön.
  assert.ok(kropp.includes(`skriv sedan \`${INTYG}\` ensamt på första raden i en ny kommentar`));
});

test('en ändrad organisation och en borttagen får kortare listor', () => {
  const filer = [fil('andrad', 'A', 'modified'), borttagen('borta')];
  const kropp = lista(filer, HAR);
  assert.equal(avlas([filer[0]], kropp).totalt, 3);
  assert.equal(tomma(kropp).length, 4);
  assert.match(kropp, /tas bort/);
});

test('en ändrad organisation länkas till ändringen, inte bara till filen', () => {
  const kropp = lista([fil('andrad', 'A', 'modified')], HAR);
  const ankare = createHash('sha256').update('data/organisationer/andrad.yaml').digest('hex');
  assert.ok(kropp.includes(`https://github.com/${REPO}/pull/7/files#diff-${ankare}`));
});

test('ett byte av id syns som en borttagen och en ny, och punkten för borttagningen säger det', () => {
  const filer = [borttagen('gammalt-namn'), fil('nytt-namn', 'A')];
  const kropp = lista(filer, HAR);
  assert.equal(avlas(filer, kropp).totalt, 7);
  assert.match(kropp, /`gammalt-namn` · tas bort/);
  assert.match(kropp, /samma organisation kvar under ett nytt id/);
});

test('har main också ändrat i filen sägs det, och listan ritas om när det ändras', () => {
  const egen = [fil('ett', 'A', 'modified')];
  const blandad = [{ ...egen[0], blandad: true }];
  assert.equal(lista(egen, HAR).includes('Main har också ändrat'), false);
  assert.match(lista(blandad, HAR), /Main har också ändrat i den här filen/);
  assert.equal(behoverRitasOm(blandad, {}, lista(egen, HAR)), true);
  assert.equal(behoverRitasOm(blandad, {}, lista(blandad, HAR)), false);
});

test('är mappen själv utbytt säger läget det, inte att en fil ligger fel', () => {
  const ogiltiga = [{ sokvag: 'data/organisationer', skal: 'är inte längre en vanlig mapp, utan till exempel en symbolisk länk', mapp: true }];
  const u = utfall(avlas([], lista([], { ...HAR, ogiltiga }), { ogiltiga }));
  assert.equal(u.state, 'failure');
  assert.match(u.description, /^Mappen data\/organisationer har bytts mot något annat/);
  assert.match(lista([], { ...HAR, ogiltiga }), /`data\/organisationer`: är inte längre en vanlig mapp/);
});

test('listan är klar först när varje punkt är avbockad', () => {
  const filer = [fil('ett', 'A'), fil('tva', 'B')];
  const tom = lista(filer, HAR);
  assert.deepEqual([avlas(filer, tom).klara, avlas(filer, tom).totalt], [0, 12]);
  const halv = bocka(tom, (rad) => rad.includes(':ett:'));
  assert.equal(avlas(filer, halv).klara, 6);
  assert.equal(avlas(filer, halv).kvar.every((k) => k.id === 'tva'), true);
  const hel = bocka(tom);
  assert.deepEqual([avlas(filer, hel).klara, avlas(filer, hel).totalt], [12, 12]);
  assert.equal(utfall(avlas(filer, halv)).state, 'pending');
  assert.match(utfall(avlas(filer, halv)).description, /6 av 12/);
});

test('avbockat räcker inte: kontrollen blir grön först när en människa har intygat', () => {
  const filer = [fil('ett', 'A')];
  const hel = avlas(filer, bocka(lista(filer, HAR)));
  // Alla rutor är ikryssade, men ingen har intygat. Det är så det ser ut när en bot har bockat.
  const utan = utfall(hel);
  assert.equal(utan.state, 'pending');
  assert.ok(utan.description.includes(INTYG));
  const med = utfall(hel, { intygadAv: 'granskare' });
  assert.equal(med.state, 'success');
  assert.match(med.description, /intygade av granskare/);
  // Ett intyg som är äldre än listans senaste ändring gäller inte.
  const gammalt = utfall(hel, { intygForaldrat: true });
  assert.equal(gammalt.state, 'pending');
  assert.match(gammalt.description, /ändrats eller dolts efter intyget/);
  // Ett intyg hjälper inte en lista som inte är avbockad.
  assert.equal(utfall(avlas(filer, lista(filer, HAR)), { intygadAv: 'granskare' }).state, 'pending');
  for (const u of [utan, med, gammalt]) assert.ok(u.description.length <= 140);
});

test('bara ordet för sig är ett intyg', () => {
  // Ordet ska stå ensamt på kommentarens första rad. Resten av kommentaren är fri.
  for (const ja of ['/granskad', '  /granskad', '\n/granskad', '/Granskad', '/granskad\n\nAllt stämmer.', '/granskad.', '/granskad!  ', '/granskad\r\nMed Windows-radbrytning']) assert.equal(arIntyg(ja), true, JSON.stringify(ja));
  // "/granskad inte än" är inget intyg, och inte heller ordet mitt i en mening.
  for (const nej of ['granskad', 'Jag skriver /granskad sen', '/granskad inte än', '/granskad, tack', '/granskade', '/granskad-inte', '/granskad/x', '', null, '> /granskad', 'Hej\n/granskad'])
    assert.equal(arIntyg(nej), false, JSON.stringify(nej));
});

test('en ändrad fil nollställer sina punkter, de andra står kvar', () => {
  const fore = [fil('ett', 'A'), fil('tva', 'B')];
  const avbockad = bocka(lista(fore, HAR));
  // Organisationen "tva" får nytt innehåll i en senare commit.
  const efter = [fil('ett', 'A'), fil('tva', 'B2')];
  const ny = lista(efter, HAR, avbockad);
  const lage = avlas(efter, ny);
  assert.equal(lage.klara, 6);
  assert.deepEqual([...new Set(lage.kvar.map((k) => k.id))], ['tva']);
});

test('avbockningen binds till hela innehållet, inte till en förkortning', () => {
  // Markören bär hela kontrollsumman. Sju lika tecken i början räcker inte för att ärva en bock.
  const a = fil('ett', 'A');
  const b = { ...fil('ett', 'B'), version: a.version.slice(0, 7) + fil('ett', 'B').version.slice(7) };
  assert.notEqual(a.version, b.version);
  assert.equal(a.version.slice(0, 7), b.version.slice(0, 7));
  const avbockad = bocka(lista([a], HAR));
  assert.equal(avlas([b], lista([b], HAR, avbockad)).klara, 0);
  assert.match(a.version, /^[0-9a-f]{64}$/);
  assert.ok(lista([a], HAR).includes(`<!-- g:ett:${a.version}:k1 -->`));
});

test('samma text som ny och som ändrad är olika versioner', () => {
  // Annars följer punkten om personuppgifter med när en post byter lista.
  assert.notEqual(version('added', 'A'), version('modified', 'A'));
  const avbockad = bocka(lista([fil('ett', 'A', 'added')], HAR));
  const sen = [fil('ett', 'A', 'modified')];
  assert.equal(avlas(sen, lista(sen, HAR, avbockad)).klara, 0);
});

test('en fil utan version går inte att lista', () => {
  assert.throws(() => lista([{ ...fil('ett', 'A'), version: 'abc1234' }], HAR), /version/);
});

test('listan säger själv om den behöver ritas om', () => {
  const filer = [fil('ett', 'A'), fil('tva', 'B')];
  const kropp = lista(filer, HAR);
  assert.equal(behoverRitasOm(filer, {}, kropp), false);
  // Avbockade rutor är ingen anledning att rita om. Då skulle den som bockar bli avbruten.
  assert.equal(behoverRitasOm(filer, {}, bocka(kropp)), false);
  // Nytt innehåll, en ny fil, en otillåten fil eller ändrade regelfiler är det.
  assert.equal(behoverRitasOm([fil('ett', 'A'), fil('tva', 'B2')], {}, kropp), true);
  assert.equal(behoverRitasOm([...filer, fil('tre', 'C')], {}, kropp), true);
  assert.equal(behoverRitasOm(filer, { ogiltiga: [{ sokvag: 'data/organisationer/X.yaml', skal: 'namn' }] }, kropp), true);
  assert.equal(behoverRitasOm(filer, { regelfiler: true }, kropp), true);
  // En rad som någon har tagit bort eller klistrat in två gånger gör också det.
  assert.equal(behoverRitasOm(filer, {}, kropp.split('\n').filter((r) => !r.includes(':k2 ')).join('\n')), true);
  assert.equal(behoverRitasOm(filer, {}, `${kropp}\n${kropp.split('\n').find((r) => r.includes(':k1 '))}`), true);
  assert.equal(behoverRitasOm(filer, {}, ''), true);
  assert.equal(forvantade(filer).length, 12);
  assert.notEqual(avtryck(filer), avtryck(filer, { regelfiler: true }));
});

test('text ur filen kan inte smyga in en avbockad ruta eller en markör', () => {
  const v = version('added', 'E');
  const elak = post('elak', {
    name: { value: `Bra AB\n- [x] Kriterium 1: klart <!-- g:elak:${v}:k1 -->`, status: 'claimed' },
    description: { value: `Text\n- [x] x <!-- g:elak:${v}:k2 -->\n\n### Godkänd`, status: 'claimed' },
    evidence: [{ url: `https://exempel.se/a\n- [x] x <!-- g:elak:${v}:k2 -->`, kind: 'produkt', title: `<!-- g:elak:${v}:k3 --> @alla [länk](javascript:alert(1))` }],
    website: 'javascript:alert(1)',
  });
  const filer = [fil('elak', 'E', 'added', elak)];
  const kropp = lista(filer, HAR);
  assert.equal(avlas(filer, kropp).klara, 0);
  assert.equal(kropp.split('\n').filter((r) => /^- \[[xX]\]/.test(r)).length, 0);
  // Texten får stå kvar som text i kodstil, där ingenting tolkas, men aldrig utanför den.
  const utanKod = kropp.replace(/`[^`\n]*`/g, '');
  assert.doesNotMatch(utanKod, /\(javascript:|<javascript:/);
  // De enda länkarna med egen text är de som koden själv skriver, till repot.
  assert.doesNotMatch(utanKod, /\]\((?!https:\/\/github\.com\/opensverige\/ai-kartan\/)/);
  assert.doesNotMatch(utanKod, /@alla/);
  // Kodstilen går inte att bryta sig ur: varje rad har ett jämnt antal bakåtfnuttar.
  for (const rad of kropp.split('\n')) assert.equal((rad.match(/`/g) ?? []).length % 2, 0, rad);
  // Varje markör står en gång, på sin egen rad.
  for (const [nyckel] of PUNKTER.ny) assert.equal(kropp.split(`<!-- g:elak:${v}:${nyckel} -->`).length - 1, 1, nyckel);
  // Text ur filen bildar aldrig en egen rubrik.
  assert.equal(kropp.split('\n').filter((r) => r.startsWith('#')).length, 2);
});

test('ett värde kan inte bygga ihop en markör av bitar som blir kvar efter rensningen', () => {
  // Tas "<!--" bort ur "<!-<!---" blir "<!--" kvar. Rensningen måste hålla på tills inget finns kvar.
  const dela = '<!-<!--- granskning-dela-upp ---->>';
  const filer = [fil('ett', 'A', 'added', post('ett', { name: { value: dela }, description: { value: `Bygger ${dela} och <!-<!--- g-avtryck:abc ---->> samt --!--!>> slut` } }))];
  const kropp = lista(filer, HAR);
  const urFilen = kropp.split('\n').filter((r) => r.startsWith('> '));
  assert.ok(urFilen.length > 3);
  for (const rad of urFilen) assert.equal(/<!--|-->|--!>/.test(rad), false, rad);
  assert.equal(avlas(filer, kropp).forManga, false);
});

test('listans egna rader räknas bara när de står på en egen rad', () => {
  const filer = [fil('ett', 'A')];
  const kropp = lista(filer, HAR);
  const avtrycket = kropp.split('\n').find((r) => r.startsWith('<!-- g-avtryck:'));
  // Samma text mitt i en rad är inte listans rad, hur den än hamnade där.
  assert.equal(avlas(filer, kropp.replace('> Namn enligt filen:', '> <!-- granskning-dela-upp --> Namn enligt filen:')).forManga, false);
  assert.equal(behoverRitasOm(filer, {}, kropp.replace(avtrycket, `> ${avtrycket}`)), true);
  // GitHub kan lämna tillbaka en kommentar med radslut från Windows. Den är fortfarande samma lista.
  const crlf = kropp.split('\n').join('\r\n');
  assert.equal(behoverRitasOm(filer, {}, crlf), false);
  const manga = Array.from({ length: MAX_ORGANISATIONER + 1 }, (_, i) => fil(`org-${i}`, `A${i}`));
  assert.equal(avlas([], lista(manga, HAR).split('\n').join('\r\n')).forManga, true);
});

test('rubriken bär bara id:t, namnet står som uppgift ur filen', () => {
  const kropp = lista([fil('exempel', 'A', 'added', post('exempel', { name: { value: 'Granskad och godkänd', status: 'claimed' } }))], HAR);
  assert.ok(kropp.includes('### `exempel` · ny'));
  assert.ok(kropp.includes('> Namn enligt filen: `Granskad och godkänd`'));
});

test('underlaget säger vad filen anger och visar källan, beskrivningen och värdnamnet', () => {
  const kropp = lista([fil('exempel', 'A')], HAR);
  assert.match(kropp, /Organisationsnummer: filen anger `confirmed`/);
  assert.match(kropp, /företagsregister/);
  assert.ok(kropp.includes('`register.example` <https://register.example/556000>'));
  assert.ok(kropp.includes('> Beskrivning enligt filen: `Bygger en tjänst som sorterar ärenden med en språkmodell.`'));
  assert.ok(kropp.includes('`exempel.se` <https://exempel.se>'));
  // Värdnamnet visas som det är, även med www, så att det går att jämföra med adressen.
  assert.ok(lista([fil('exempel', 'A', 'added', post('exempel', { website: 'https://www.exempel.se/' }))], HAR).includes('`www.exempel.se` <https://www.exempel.se/>'));
  // Ordet "bekräftat" i flödets egen röst lovar mer än flödet har prövat.
  assert.doesNotMatch(kropp, /organisationsnummer: bekräftat/i);
});

test('värden som inte är text ger ingen krasch och ingen text', () => {
  const konstig = post('konstig', { name: { value: { toString: 1 } }, type: { value: ['a'] }, description: { value: 12 }, evidence: [{ url: {}, kind: { toString: 1 }, title: { toString: 1 } }], org_number: { status: 'confirmed', source_type: { toString: 1 }, source_url: 5 } });
  const filer = [fil('konstig', 'K', 'added', konstig)];
  const kropp = lista(filer, HAR);
  assert.equal(avlas(filer, kropp).totalt, 6);
  assert.equal(ren({ toString: 1 }), '');
  assert.equal(ren(['a']), '');
  assert.equal(ren(12), '12');
});

test('en lista som någon har klippt i räknas inte som klar', () => {
  const filer = [fil('ett', 'A')];
  const hel = bocka(lista(filer, HAR));
  // Två punkter är borttagna ur kommentaren. De som finns kvar är avbockade.
  const klippt = hel.split('\n').filter((r) => !r.includes(':k2 ') && !r.includes(':k3 ')).join('\n');
  const lage = avlas(filer, klippt);
  assert.equal(lage.klara, 4);
  assert.equal(lage.totalt, 6);
  assert.equal(lage.manipulerad, true);
  assert.equal(utfall(lage).state, 'pending');
  // En kommentar utan listans markör är ingen lista alls.
  assert.equal(avlas(filer, '- [x] allt klart').klara, 0);
  // Samma markör på två rader gäller inte.
  const dubbel = `${hel}\n${hel.split('\n').find((r) => r.includes(':k1 '))}`;
  assert.equal(avlas(filer, dubbel).klara, 5);
});

test('en pull request utan organisationer behöver ingen granskning mot kriterierna', () => {
  assert.deepEqual(utfall(avlas([], '')), { state: 'success', description: 'Inga organisationer ändras' });
});

test('ändras regelfiler sägs det, så att grönt inte läses som att de är granskade', () => {
  // Valideringen läser genom organisationer.mjs och belagg.mjs. En ändring där ändrar vad som blir grönt.
  for (const f of ['kriterier.md', 'schema/organisation.schema.json', 'data/taxonomi/typer.yaml', 'scripts/validera.mjs', 'scripts/granskning.mjs', 'scripts/lib/granskning.mjs', 'scripts/lib/granskningskorning.mjs', 'scripts/lib/organisationer.mjs', 'scripts/lib/belagg.mjs', '.github/workflows/granskning.yml'])
    assert.equal(arRegelfil(f), true, f);
  for (const f of ['README.md', 'src/pages/kriterier.astro', 'data/organisationer/x.yaml', 'scripts/lib/sok.mjs']) assert.equal(arRegelfil(f), false, f);
  const u = utfall(avlas([], ''), { regelfiler: true });
  assert.equal(u.state, 'success');
  assert.match(u.description, /regel/i);
  assert.ok(u.description.length <= 140);
  // Det sägs också när organisationer ändras i samma pull request, i listan och i läget.
  const filer = [fil('ett', 'A')];
  const kropp = lista(filer, { ...HAR, regelfiler: true });
  assert.match(kropp, /ändrar också regelfiler/);
  assert.doesNotMatch(lista(filer, HAR), /regelfiler/);
  for (const lage of [utfall(avlas(filer, kropp), { regelfiler: true }), utfall(avlas(filer, bocka(kropp)), { regelfiler: true }), utfall(avlas(filer, bocka(kropp)), { regelfiler: true, intygadAv: 'granskare' })]) {
    assert.match(lage.description, /Regelfiler ändras också/);
    assert.ok(lage.description.length <= 140);
  }
});

test('en fil som inte får ligga i mappen gör kontrollen röd, aldrig grön', () => {
  const ogiltiga = [{ sokvag: 'data/organisationer/Evil.yaml', skal: 'namnet är inte ett id' }];
  const lage = avlas([], '', { ogiltiga });
  const u = utfall(lage);
  assert.equal(u.state, 'failure');
  assert.match(u.description, /Evil\.yaml/);
  assert.ok(u.description.length <= 140);
  // Även när allt annat är avbockat och intygat.
  const filer = [fil('ett', 'A')];
  assert.equal(utfall(avlas(filer, bocka(lista(filer, HAR)), { ogiltiga }), { intygadAv: 'granskare' }).state, 'failure');
  assert.match(lista(filer, { ...HAR, ogiltiga }), /Evil\.yaml/);
});

test('för många organisationer i samma pull request stoppas', () => {
  const filer = Array.from({ length: MAX_ORGANISATIONER + 1 }, (_, i) => fil(`org-${i}`, `A${i}`));
  const kropp = lista(filer, HAR);
  assert.match(kropp, /Dela upp/);
  assert.equal(utfall(avlas(filer, kropp)).state, 'failure');
  assert.match(utfall(avlas(filer, kropp)).description, /^För många organisationer/);
});

test('en lista som blir för lång för en kommentar stoppas i stället för att krascha', () => {
  // Så långa poster som filerna tillåter: åtta belägg med långa adresser och tecken på flera byte.
  const lang = (i) => post(`org-${i}`, { evidence: Array.from({ length: 8 }, (_, n) => ({ url: `https://exempel.se/${'a'.repeat(270)}${n}`, kind: 'produkt', title: 'ö'.repeat(70) })), description: { value: 'ä'.repeat(600) } });
  const filer = Array.from({ length: MAX_ORGANISATIONER }, (_, i) => fil(`org-${i}`, `A${i}`, 'added', lang(i)));
  const full = lista(filer, HAR);
  assert.ok(Buffer.byteLength(full) <= MAX_BYTE, `${Buffer.byteLength(full)} byte`);
  // Med en lägre gräns blir samma lista en uppmaning att dela upp, och kontrollen blir röd.
  const trang = lista(filer, { ...HAR, maxByte: 20_000 });
  assert.ok(Buffer.byteLength(trang) <= 20_000);
  assert.match(trang, /Dela upp/);
  assert.equal(trang.includes('- [ ] '), false);
  assert.equal(utfall(avlas(filer, trang)).state, 'failure');
  // Läget säger vad som är fel. Organisationerna är inte för många, det är listan som är för lång.
  assert.match(utfall(avlas(filer, trang)).description, /^Listan blir för lång/);
  // En vanlig full pull request ryms med god marginal.
  const vanlig = lista(Array.from({ length: MAX_ORGANISATIONER }, (_, i) => fil(`org-${i}`, `A${i}`)), HAR);
  assert.ok(vanlig.includes('- [ ] '));
  assert.ok(Buffer.byteLength(vanlig) < MAX_BYTE / 2);
});

test('utfallet säger vem som intygade och ryms i en statusrad', () => {
  const filer = [fil('ett', 'A')];
  const u = utfall(avlas(filer, bocka(lista(filer, HAR))), { intygadAv: 'granskare' });
  assert.match(u.description, /granskare/);
  assert.ok(u.description.length <= 140);
  // Namnet rensas, och ett långt namn får inte tränga ut resten.
  assert.doesNotMatch(utfall(avlas(filer, bocka(lista(filer, HAR))), { intygadAv: '<b>@elak</b>' }).description, /[<>@]/);
});

test('ett och-tecken i löpande text kan inte bli ett omnämnande eller en länk', () => {
  // GitHub tolkar &commat; som @ och &num; som #. Skrivs och-tecknet som &amp; händer inte det.
  assert.equal(ren('&commat;alla'), '&amp;commat;alla');
  assert.equal(ren('&num;1 och H&M'), '&amp;num;1 och H&amp;M');
});

test('värden ur filen visas som de är, i kodstil där ingenting tolkas', () => {
  // I kodstil blir ingenting en länk, ett omnämnande, en emoji eller en formel: varken @namn,
  // GH-21, ett commit-id, :x: eller $x$. Då kan värdet också visas oförvanskat, med parenteser och allt.
  const elak = post('elak', {
    name: { value: 'Sinch AB (publ) @octocat GH-21 :x: $x$ &commat;alla', status: 'claimed' },
    legal_name: { value: 'Exempel & Co AB', status: 'confirmed', source_type: 'company_register' },
    description: { value: 'Se #1, 0123456789abcdef0123456789abcdef01234567 och `kod` här.', status: 'claimed' },
    evidence: [{ url: 'https://exempel.se/a', kind: 'produkt', title: 'Titel med *stjärnor* och [länk](https://ond.example)' }],
  });
  const kropp = lista([fil('elak', 'E', 'added', elak)], HAR);
  assert.ok(kropp.includes('> Namn enligt filen: `Sinch AB (publ) @octocat GH-21 :x: $x$ &commat;alla`'));
  assert.ok(kropp.includes('> Registrerat namn enligt filen: `Exempel & Co AB`'));
  // En bakåtfnutt i värdet kan inte avsluta kodstilen i förtid.
  assert.ok(kropp.includes("> Beskrivning enligt filen: `Se #1, 0123456789abcdef0123456789abcdef01234567 och 'kod' här.`"));
  assert.ok(kropp.includes("`Titel med *stjärnor* och [länk](https://ond.example)`"));
  // Utanför kodstil och utanför de länkar koden själv skriver står ingenting ur filen.
  const utanKod = kropp.split('\n').filter((r) => r.startsWith('> ')).map((r) => r.replace(/`[^`]*`/g, '').replace(/<https?:[^>]+>/g, '')).join('\n');
  assert.doesNotMatch(utanKod, /octocat|GH-21|:x:|\$x\$|ond\.example|stjärnor|0123456789abcdef/);
});

test('underlaget säger att det är ett utdrag, och hur mycket som inte visas', () => {
  const manga = post('manga', {
    evidence: Array.from({ length: 14 }, (_, i) => ({ url: `https://exempel.se/${i}`, kind: 'produkt', title: `Belägg ${i}`, note: i < 3 ? 'En anteckning.' : undefined })),
    name: { value: 'N'.repeat(200), status: 'claimed', note: 'Anteckning om namnet.' },
  });
  const kropp = lista([fil('manga', 'M', 'added', manga)], HAR);
  assert.match(kropp, /Belägg \(14\)/);
  assert.equal(kropp.split('\n').filter((r) => r.startsWith('> - ')).length, 12);
  assert.match(kropp, /och 2 belägg till/);
  // Ett namn som kapas slutar med tre punkter, så att det syns att det fortsätter.
  assert.match(kropp, /> Namn enligt filen: `N+…`/);
  // Anteckningarna i filen visas inte i listan. Det sägs, med antal, så att ingen tror sig ha läst allt.
  assert.match(kropp, /4 anteckningar/);
  assert.match(kropp, /utdrag/i);
  assert.match(kropp, /Läs hela filen/);
});

test('rensad text är en rad utan tecken som styr Markdown', () => {
  assert.equal(ren('  Bra  AB\n'), 'Bra AB');
  assert.equal(ren('<b>*_`x`_*</b> [y](z) @du #1 | a'), 'bx/b yz du 1 a');
  assert.equal(ren('a'.repeat(200)).length, 80);
  assert.equal(ren(null), '');
  // En adress i löptext blir annars en länk av sig själv hos GitHub.
  assert.equal(ren('se https://ond.example/x och www.ond.example'), 'se https ond.example/x och ond.example');
});

test('en adress går inte att bygga ihop genom att rensningen tar bort något mitt i den', () => {
  for (const t of ['https:/www./ond.example/login', 'https:www.//ond.example', 'http:/WWW./ond.example', 'ht<tps://ond.example', 'https:/*/ond.example', 'wwwww.w..ond.example', 'w<ww.ond.example']) {
    const ut = ren(t);
    assert.doesNotMatch(ut, /:\/\//, `${t} gav ${ut}`);
    assert.doesNotMatch(ut, /\bwww\./i, `${t} gav ${ut}`);
  }
});

test('osynliga tecken och tecken som vänder textriktningen tas bort', () => {
  assert.equal(ren('God\u202Etset\u202C x\u200By\u2066z\u2069\uFEFF'), 'Godtset xyz');
  // Fullbreddstecken viks till vanliga innan rensningen, så att de inte slinker förbi.
  assert.equal(ren('\uFF1Cb\uFF1E'), 'b');
});

test('bara vanliga webbadresser blir länkar', () => {
  assert.equal(sakerLank('https://exempel.se/sida?x=1'), 'https://exempel.se/sida?x=1');
  assert.equal(sakerLank('https://medium.com/@nagon/artikel'), 'https://medium.com/@nagon/artikel');
  for (const u of ['javascript:alert(1)', 'https://x.se/a b', 'https://x.se/<script>', 'ftp://x.se', '', null, `https://x.se/${'a'.repeat(400)}`]) assert.equal(sakerLank(u), null, String(u));
});

test('en adress med användarnamn före värden blir ingen länk', () => {
  // Annars ser länken ut att gå till github.com fast den går till någon annan.
  for (const u of ['https://github.com@ond.example/opensverige/ai-kartan', 'https://bolagsverket.se:x@ond.example/', 'https://@ond.example/']) assert.equal(sakerLank(u), null, u);
});
