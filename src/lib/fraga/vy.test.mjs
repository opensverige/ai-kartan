// Tester för svaren som HTML: korten, lägena och att inget råfel når besökaren.
//   npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import { TOMT_FILTER } from '../filter.ts';
import { kortHtml, lagesrad, svarHtml, ingenAnslutningHtml } from './vy.ts';

const E = {
  typer: { bolag: 'Bolag', myndighet: 'Myndighet' },
  typerPlural: { bolag: 'Bolag' },
  erbjuder: { infrastruktur: 'Infrastruktur och hosting' },
  omraden: { halsa: 'Hälsa och life science' },
  lan: { '14': 'Västra Götalands län' },
};
const L = { kartbas: '/', orgbas: '/organisation/', bidra: '/bidra', discord: 'https://discord.gg/test' };
const POST = { id: 'sinch', n: 'Sinch', t: 'bolag', kn: 'Stockholm', d: 'Utvecklar API:er för röst.', ds: 'claimed', dv: '2026-10-04' };
const POSTER = new Map([['sinch', POST], ['myndigheten', { id: 'myndigheten', n: 'Myndigheten', t: 'myndighet', kn: null, d: 'Handlägger.', ds: 'confirmed', dv: '2026-10-01' }]]);
const FAQ = [{ id: 'bidra', fragor: ['Hur lägger jag till?'], svar: 'Du lägger till via sidan Bidra.', kalla_url: 'https://karta.opensverige.se/bidra', kontrollerad: '2026-10-19' }];

function svar(delar = {}) {
  return {
    sort: 'traffar', tolkning: 'Jag tolkar det som att du söker organisationer som nämner ”röst”.', filter: { ...TOMT_FILTER, q: 'röst' },
    borttaget: [], okandPlats: null, kartlank: '/?q=r%C3%B6st', totalt: 1, ids: ['sinch'], visade: ['sinch'], regel: 'alla',
    skal: { sinch: ['”röst” i beskrivningen'] }, faq: [], manniska: false, utanModell: false, modellfel: null, ...delar,
  };
}
const html = (s, lage = 'server', fraga = 'röst') => svarHtml(s, lage, POSTER, FAQ, E, L, fraga);

test('kortet visar beskrivningen ordagrant, escapad, med status, datum, skäl och permalänk', () => {
  const k = kortHtml({ ...POST, d: '<script>x</script> röst' }, ['”röst” i beskrivningen', 'Stockholm'], E, L);
  assert.ok(k.includes('&lt;script&gt;x&lt;/script&gt; röst'));
  assert.ok(!k.includes('<script>'));
  assert.ok(k.includes('egen uppgift'));
  assert.ok(k.includes('kontrollerad 2026-10-04'));
  assert.ok(k.includes('Matchar: ”röst” i beskrivningen · Stockholm'));
  assert.ok(k.includes('href="/organisation/sinch"'));
  assert.ok(k.includes('Bolag · Stockholm'));
  assert.ok(kortHtml(POSTER.get('myndigheten'), [], E, L).includes('bekräftad'));
  assert.ok(kortHtml(POSTER.get('myndigheten'), [], E, L).includes('Utan plats'));
});

test('antal och länken till kartan', () => {
  const many = html(svar({ totalt: 18, visade: ['sinch'], regel: 'dagligt' }));
  assert.ok(many.includes('18 på kartan matchar · visar 1, urvalet byts varje dag'));
  assert.ok(many.includes('href="/?q=r%C3%B6st"'));
  assert.ok(many.includes('Visa alla 18 på kartan →'));
  const fa = html(svar());
  assert.ok(fa.includes('1 på kartan matchar'));
  assert.ok(!fa.includes('urvalet byts'));
});

test('bred fråga: fyra snabbsvar och alla på kartan', () => {
  const h = html(svar({ sort: 'bred', ids: [], visade: [], totalt: 0, skal: {}, kartlank: '/' }));
  assert.equal((h.match(/data-skicka=/g) ?? []).length, 4);
  assert.ok(h.includes('Alla 2 på kartan bygger AI'));
});

test('ranking, kontakt och utanför ger fasta texter utan kort', () => {
  const tomt = { ids: [], visade: [], totalt: 0, skal: {}, kartlank: '/', tolkning: '' };
  assert.ok(html(svar({ sort: 'ranking', ...tomt })).includes('Kartan rankar inte'));
  assert.ok(!html(svar({ sort: 'ranking', ...tomt })).includes('class="kort"'));
  assert.ok(html(svar({ sort: 'kontakt', ...tomt })).includes('Jag kan inte introducera dig'));
  assert.ok(html(svar({ sort: 'utanfor', ...tomt })).includes('Jag är till för frågor om svenska AI-byggare'));
});

test('OpenSverige: svaret ordagrant med källa och datum', () => {
  const h = html(svar({ sort: 'opensverige', faq: ['bidra'], ids: [], visade: [], totalt: 0, skal: {}, tolkning: '' }));
  assert.ok(h.includes('Du lägger till via sidan Bidra.'));
  assert.ok(h.includes('Källa:'));
  assert.ok(h.includes('href="https://karta.opensverige.se/bidra"'));
  assert.ok(h.includes('kontrollerad 2026-10-19'));
});

test('borttagna sökord och okänd plats sägs rakt ut', () => {
  assert.ok(html(svar({ borttaget: ['känsliga'] })).includes('Ingen nämner ”känsliga”.'));
  assert.ok(html(svar({ okandPlats: 'Norrland' })).includes('Jag hittar ingen plats som heter ”Norrland”, så jag sökte i hela Sverige.'));
});

test('Discord-rutan visas när frågan gäller människor, när inget hittas och vid kontaktfrågor', () => {
  const tomt = { ids: [], visade: [], totalt: 0, skal: {}, kartlank: '/' };
  for (const s of [svar({ sort: 'tomt', ...tomt }), svar({ sort: 'kontakt', ...tomt }), svar({ sort: 'manniska', ...tomt }), svar({ manniska: true })]) {
    assert.ok(html(s).includes('href="https://discord.gg/test"'), s.sort);
    assert.ok(html(s).includes('Kopiera frågan'), s.sort);
  }
  assert.ok(!html(svar()).includes('discord.gg'));
  assert.ok(html(svar({ sort: 'tomt', ...tomt })).includes('href="/bidra"'));
});

test('så hittade jag dem, och tummarna', () => {
  assert.ok(html(svar()).includes('Så hittade jag dem'));
  assert.ok(html(svar()).includes('Modellen väljer inte vilka som visas eller i vilken ordning.'));
  assert.ok(html(svar({ utanModell: true, modellfel: 'saknas' })).includes('Tolkningen gjordes utan AI.'));
  assert.ok(html(svar()).includes('Hjälpte det?'));
  assert.ok(html(svar({ sort: 'opensverige', faq: ['bidra'], ids: [], visade: [], totalt: 0, skal: {} })).includes('Hjälpte det?'));
});

test('lägesraden väljs ur modellfelet och klientens läge', () => {
  assert.equal(lagesrad({ modellfel: null }, 'server'), null);
  for (const fel of ['saknas', 'slut', 'nyckel']) assert.equal(lagesrad({ modellfel: fel }, 'server'), 'AI-tolkningen är pausad just nu. Svaren bygger på orden i din fråga.');
  for (const fel of ['begransad', 'nere', 'tidsgrans', 'ogiltig']) assert.equal(lagesrad({ modellfel: fel }, 'server'), 'AI:n svarade inte den här gången. Svaren bygger på orden i din fråga.');
  assert.equal(lagesrad({ modellfel: 'saknas' }, 'lokal'), 'AI:n svarade inte den här gången. Svaren bygger på orden i din fråga.');
  assert.equal(lagesrad({ modellfel: 'saknas' }, 'takt'), 'Du har frågat många gånger i rad. Svaren bygger på orden i din fråga.');
  assert.ok(html(svar({ modellfel: 'slut', utanModell: true })).includes('AI-tolkningen är pausad just nu.'));
});

test('inget råfel når besökaren, i något läge', () => {
  const sorter = ['traffar', 'bred', 'tomt', 'manniska', 'ranking', 'kontakt', 'opensverige', 'utanfor'];
  for (const sort of sorter) {
    for (const modellfel of [null, 'slut', 'nere']) {
      for (const lage of ['server', 'lokal', 'takt']) {
        const h = html(svar({ sort, modellfel, utanModell: modellfel !== null, faq: sort === 'opensverige' ? ['bidra'] : [] }), lage);
        assert.ok(!/Error|undefined|null|NaN|\[object/.test(h), `${sort} ${modellfel} ${lage}`);
      }
    }
  }
  const ingen = ingenAnslutningHtml();
  assert.ok(ingen.includes('Ingen anslutning just nu.'));
  assert.ok(ingen.includes('Försök igen →'));
});

test('tolkningsraden escapas', () => {
  assert.ok(html(svar({ tolkning: 'Jag <b>tolkar</b>' })).includes('Jag &lt;b&gt;tolkar&lt;/b&gt;'));
});
