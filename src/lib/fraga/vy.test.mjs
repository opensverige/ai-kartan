// Tester för paletten som HTML: raderna, förslagen, svaren och att inget råfel når besökaren.
//   npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import { TOMT_FILTER } from '../filter.ts';
import { forslagHtml, ingenAnslutningHtml, lagesrad, radHtml, svarHtml, utdrag } from './vy.ts';

const E = {
  typer: { bolag: 'Bolag', myndighet: 'Myndighet' },
  typerPlural: { bolag: 'Bolag' },
  erbjuder: { infrastruktur: 'Infrastruktur och hosting' },
  omraden: { halsa: 'Hälsa och life science' },
  lan: { '14': 'Västra Götalands län' },
  typikoner: { myndighet: '/ikoner/myndighet.png' },
};
const L = { kartbas: '/', orgbas: '/organisation/', bidra: '/bidra', discord: 'https://discord.gg/test', infra: 'https://infra.test', infralogo: '/ai-infra.png' };
const POST = { id: 'sinch', n: 'Sinch', t: 'bolag', kn: 'Stockholm', d: 'Utvecklar API:er för röst och meddelanden.', ds: 'claimed', dv: '2026-10-04' };
const MYNDIGHET = { id: 'myndigheten', n: 'Myndigheten', t: 'myndighet', kn: null, d: 'Handlägger.', ds: 'confirmed', dv: '2026-10-01' };
const POSTER = new Map([['sinch', POST], ['myndigheten', MYNDIGHET]]);
const FAQ = [{ id: 'bidra', fragor: ['Hur lägger jag till?'], svar: 'Du lägger till via sidan Bidra.', kalla_url: 'https://karta.opensverige.se/bidra', kontrollerad: '2026-10-19' }];

function svar(delar = {}) {
  return {
    sort: 'traffar', tolkning: 'Jag tolkar det som att du söker organisationer som nämner ”röst”.', filter: { ...TOMT_FILTER, q: 'röst' },
    borttaget: [], okandPlats: null, kartlank: '/?q=r%C3%B6st', totalt: 1, ids: ['sinch'], visade: ['sinch'], regel: 'alla',
    skal: { sinch: ['”röst” i beskrivningen'] }, faq: [], manniska: false, utanModell: false, modellfel: null, ...delar,
  };
}
const vy = (s, lage = 'server', fraga = 'röst') => svarHtml(s, lage, POSTER, FAQ, E, L, fraga);
const allt = (v) => v.kropp + v.vidare;
const TOMT = { ids: [], visade: [], totalt: 0, skal: {}, kartlank: '/', tolkning: '' };

test('utdraget börjar strax före ordet och markerar det', () => {
  const lang = 'En lång inledning om helt andra saker innan det kommer: röstagenter för kundtjänst.';
  const u = utdrag(lang, 'röst');
  assert.ok(u.startsWith('…'));
  assert.ok(u.includes('<mark>röst</mark>agenter'));
  assert.equal(utdrag('Röst i början', 'rost'), '<mark>Röst</mark> i början');
  assert.equal(utdrag('Inget här', 'röst'), 'Inget här');
  assert.equal(utdrag('<b>röst</b>', 'röst'), '&lt;b&gt;<mark>röst</mark>&lt;/b&gt;');
});

test('raden visar namn, utdrag, typ och ort, status med datum, och escapar', () => {
  const r = radHtml({ ...POST, n: '<script>x</script>' }, 'utdrag', E);
  assert.ok(r.includes('&lt;script&gt;x&lt;/script&gt;'));
  assert.ok(!r.includes('<script>'));
  assert.ok(r.includes('role="option"'));
  assert.ok(r.includes('data-org="sinch"'));
  assert.ok(r.includes('Bolag · Stockholm'));
  assert.ok(r.includes('egen uppgift'));
  assert.ok(r.includes('kontrollerad 2026-10-04'));
  const m = radHtml(MYNDIGHET, '', E);
  assert.ok(m.includes('bekräftad'));
  assert.ok(m.includes('Utan plats'));
  assert.ok(m.includes('src="/ikoner/myndighet.png"'));
});

test('förslagen: Fråga AI först, sedan organisationer och platser', () => {
  const h = forslagHtml('röst', [POST], [{ typ: 'lan', kod: '14', namn: 'Västra Götalands län', under: 'Län', antal: 1 }], E, L);
  assert.ok(h.indexOf('Fråga AI') < h.indexOf('Sinch'));
  assert.ok(h.indexOf('Sinch') < h.indexOf('Västra Götalands län'));
  assert.ok(h.includes('role="listbox"'));
  assert.ok(h.includes('data-fraga'));
  assert.ok(h.includes('<mark>röst</mark>'));
  assert.ok(h.includes('data-plats="lan:14"'));
  assert.ok(h.includes('Län · 1 organisation<'));
  assert.ok(!h.includes('aria-disabled'));
});

test('en för lång fråga kan inte väljas', () => {
  const h = forslagHtml('a'.repeat(301), [], [], E, L);
  assert.ok(h.includes('aria-disabled="true"'));
  assert.ok(h.includes('Frågan är för lång. Korta den lite.'));
});

test('träffar: tolkningen, antalet och urvalsregeln, raderna och Visa alla', () => {
  const v = vy(svar({ totalt: 18, regel: 'dagligt' }));
  assert.ok(v.kropp.includes('18 på kartan matchar · visar 1, urvalet byts varje dag · i namnordning'));
  assert.ok(v.kropp.includes('Jag tolkar det som att du söker'));
  assert.ok(v.kropp.includes('<mark>röst</mark>'));
  assert.ok(v.vidare.includes('href="/?q=r%C3%B6st"'));
  assert.ok(v.vidare.includes('data-kartlank="svar"'));
  assert.ok(v.vidare.includes('Visa alla 18 på kartan →'));
  assert.equal(v.besked, '18 på kartan matchar.');
  const fa = vy(svar());
  assert.ok(fa.kropp.includes('1 på kartan matchar · i namnordning'));
  assert.ok(!fa.kropp.includes('urvalet byts'));
});

test('en träff utan ord i texten visar skälen', () => {
  const v = vy(svar({ skal: { sinch: ['Hälsa och life science'] } }));
  assert.ok(v.kropp.includes('Matchar Hälsa och life science · Utvecklar API:er'));
});

test('bred fråga: fyra smalare frågor och alla på kartan', () => {
  const v = vy(svar({ sort: 'bred', ...TOMT }));
  assert.equal((v.kropp.match(/data-skicka=/g) ?? []).length, 4);
  assert.ok(v.kropp.includes('Alla 2 på kartan bygger AI'));
  assert.ok(v.vidare.includes('data-kartlank="alla"'));
  assert.ok(v.vidare.includes('href="/" data-kartlank="alla"'));
});

test('i betan bär Visa alla flaggan, men inte kopian till Discord', () => {
  const B = { ...L, kartbas: 'https://karta.test/', beta: true };
  const traffar = svarHtml(svar({ manniska: true }), 'server', POSTER, FAQ, E, B, 'röst');
  assert.ok(traffar.vidare.includes('href="https://karta.test/?q=r%C3%B6st&amp;fraga=1" data-kartlank="svar"'));
  assert.ok(traffar.vidare.includes('data-kopiera="röst\n(via https://karta.test/?q=r%C3%B6st)"'));
  assert.equal((traffar.vidare.match(/fraga=1/g) ?? []).length, 1);
  // Utan urval börjar betan på första skärmen. #karta öppnar kartan, som ett vanligt klick gör.
  const bred = svarHtml(svar({ sort: 'bred', ...TOMT }), 'server', POSTER, FAQ, E, B, 'AI');
  assert.ok(bred.vidare.includes('href="https://karta.test/?fraga=1#karta" data-kartlank="alla"'));
});

test('ranking, kontakt och utanför ger fasta texter utan rader', () => {
  assert.ok(vy(svar({ sort: 'ranking', ...TOMT })).kropp.includes('Kartan rankar inte'));
  assert.ok(!allt(vy(svar({ sort: 'ranking', ...TOMT }))).includes('role="option"'));
  assert.ok(vy(svar({ sort: 'kontakt', ...TOMT })).kropp.includes('Jag kan inte introducera dig'));
  assert.ok(vy(svar({ sort: 'utanfor', ...TOMT })).kropp.includes('Jag är till för frågor om svenska AI-byggare'));
  assert.equal(vy(svar({ sort: 'utanfor', ...TOMT })).vidare, '');
});

test('OpenSverige: svaret ordagrant med källa och datum', () => {
  const v = vy(svar({ sort: 'opensverige', faq: ['bidra'], ...TOMT }));
  assert.ok(v.kropp.includes('Du lägger till via sidan Bidra.'));
  assert.ok(v.kropp.includes('Källa:'));
  assert.ok(v.kropp.includes('href="https://karta.opensverige.se/bidra"'));
  assert.ok(v.kropp.includes('kontrollerad 2026-10-19'));
});

test('borttagna sökord och okänd plats sägs rakt ut', () => {
  assert.ok(vy(svar({ borttaget: ['känsliga'] })).kropp.includes('Ingen nämner ”känsliga”.'));
  assert.ok(vy(svar({ okandPlats: 'Norrland' })).kropp.includes('Jag hittar ingen plats som heter ”Norrland”, så jag sökte i hela Sverige.'));
});

test('Discord visas när frågan gäller människor, när inget hittas och vid kontaktfrågor', () => {
  for (const s of [svar({ sort: 'tomt', ...TOMT }), svar({ sort: 'kontakt', ...TOMT }), svar({ sort: 'manniska', ...TOMT }), svar({ manniska: true })]) {
    assert.ok(vy(s).vidare.includes('href="https://discord.gg/test"'), s.sort);
    assert.ok(vy(s).vidare.includes('Kopiera frågan'), s.sort);
  }
  assert.ok(!allt(vy(svar())).includes('discord.gg'));
  assert.ok(vy(svar({ sort: 'tomt', ...TOMT })).vidare.includes('href="/bidra"'));
  assert.ok(vy(svar({ sort: 'tomt', ...TOMT }), 'server', 'Vem bygger?').vidare.includes('data-kopiera="Vem bygger?\n(via /)"'));
});

test('så hittade jag dem, och tummarna', () => {
  assert.ok(vy(svar()).kropp.includes('Så hittade jag dem'));
  assert.ok(vy(svar()).kropp.includes('Modellen väljer inte vilka som visas eller i vilken ordning.'));
  assert.ok(vy(svar({ utanModell: true, modellfel: 'saknas' })).kropp.includes('Tolkningen gjordes utan AI.'));
  assert.ok(vy(svar()).vidare.includes('Hjälpte det?'));
  assert.ok(vy(svar({ sort: 'opensverige', faq: ['bidra'], ...TOMT })).vidare.includes('Hjälpte det?'));
});

test('lägesraden väljs ur modellfelet och klientens läge', () => {
  assert.equal(lagesrad({ modellfel: null }, 'server'), null);
  for (const fel of ['saknas', 'slut', 'nyckel', 'modell']) assert.equal(lagesrad({ modellfel: fel }, 'server'), 'AI-tolkningen är pausad just nu. Svaren bygger på orden i din fråga.');
  for (const fel of ['begransad', 'nere', 'tidsgrans', 'ogiltig']) assert.equal(lagesrad({ modellfel: fel }, 'server'), 'AI:n svarade inte den här gången. Svaren bygger på orden i din fråga.');
  assert.equal(lagesrad({ modellfel: 'saknas' }, 'lokal'), 'AI:n svarade inte den här gången. Svaren bygger på orden i din fråga.');
  assert.equal(lagesrad({ modellfel: 'saknas' }, 'takt'), 'Du har frågat många gånger i rad. Svaren bygger på orden i din fråga.');
  const v = vy(svar({ modellfel: 'slut', utanModell: true }));
  assert.ok(v.kropp.includes('AI-tolkningen är pausad just nu.'));
  assert.ok(v.besked.startsWith('AI-tolkningen är pausad just nu.'));
});

test('inget råfel når besökaren, i något läge', () => {
  const sorter = ['traffar', 'bred', 'tomt', 'manniska', 'ranking', 'kontakt', 'opensverige', 'utanfor'];
  for (const sort of sorter) {
    for (const modellfel of [null, 'slut', 'nere']) {
      for (const lage of ['server', 'lokal', 'takt']) {
        const v = vy(svar({ sort, modellfel, utanModell: modellfel !== null, faq: sort === 'opensverige' ? ['bidra'] : [] }), lage);
        assert.ok(!/Error|undefined|null|NaN|\[object/.test(allt(v) + v.besked), `${sort} ${modellfel} ${lage}`);
        assert.ok(v.besked.length > 0, `${sort} ${modellfel} ${lage}`);
      }
    }
  }
  const ingen = ingenAnslutningHtml();
  assert.ok(ingen.includes('Ingen anslutning just nu.'));
  assert.ok(ingen.includes('Försök igen →'));
});

test('tolkningsraden escapas', () => {
  assert.ok(vy(svar({ tolkning: 'Jag <b>tolkar</b>' })).kropp.includes('Jag &lt;b&gt;tolkar&lt;/b&gt;'));
});

test('en fråga om GPU eller hosting visar AI-Infra direkt under Fråga AI', () => {
  const h = forslagHtml('Ja behöver hyra GPU', [], [], E, L);
  assert.ok(h.includes('href="https://infra.test"'));
  assert.ok(h.includes('data-infrarad'));
  assert.ok(h.includes('role="option"'));
  assert.ok(h.indexOf('Fråga AI') < h.indexOf('AI-Infra'));
  assert.ok(!forslagHtml('röst', [POST], [], E, L).includes('AI-Infra'));
});

test('ett svar om infrastruktur har AI-Infra först, också när kartan inte har något', () => {
  const infra = vy(svar({ filter: { ...TOMT_FILTER, erbjuder: ['infrastruktur'] } }), 'server', 'Vem hyr ut servrar?');
  assert.ok(infra.kropp.indexOf('AI-Infra') < infra.kropp.indexOf('Sinch'));
  assert.ok(infra.kropp.includes('href="https://infra.test"'));
  const tomt = vy(svar({ sort: 'tomt', ...TOMT }), 'server', 'Jag behöver hyra GPU');
  assert.ok(tomt.kropp.includes('AI-Infra'));
  assert.ok(!allt(vy(svar())).includes('AI-Infra'));
});
