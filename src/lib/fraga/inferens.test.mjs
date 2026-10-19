// Tester för anropet till språkmodellen: schema, kontroll, prompt och att varje fel får ett namn.
//   node --test src/lib/fraga/inferens.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { byggMeddelanden, byggSchema, arModellsvar, skapaTolkare, systemprompt, felsort, arModellfel } from './inferens.ts';

/** Väntar ut ett kast och ger felets namn, eller null om felet saknar namn. */
async function felnamn(lofte) {
  try {
    await lofte;
  } catch (e) {
    return arModellfel(e) ? e.modellfel : null;
  }
  assert.fail('tolkaren skulle ha kastat');
}

const ETIKETTER = {
  omraden: { halsa: 'Hälsa och life science' },
  erbjuder: { infrastruktur: 'Infrastruktur och hosting' },
  typer: { bolag: 'Bolag' },
  typerPlural: { bolag: 'Bolag' },
  lan: {},
};
const FAQ = [{ id: 'bidra', fragor: ['Hur lägger jag till mitt bolag?'] }];
const GILTIGT = {
  avsikt: 'hitta',
  omrade: ['halsa'],
  erbjuder: [],
  typ: [],
  plats: 'Göteborg',
  sokord: ['röst'],
  faq: [],
  manniska: false,
  tolkning: 'Jag tolkar det som att du söker organisationer inom hälsa i Göteborg.',
};
const INST = { bas: 'https://api.example/v1', nyckel: 'hemlig', modell: 'google/gemma', tidsgrans: 6000 };

function falskHamta(innehall, status = 200) {
  const anrop = [];
  const fn = async (url, init) => {
    anrop.push({ url, init });
    const content = Array.isArray(innehall) ? innehall[anrop.length - 1] : innehall;
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status });
  };
  return { anrop, fn };
}

function kroppAv(anrop) {
  assert.equal(typeof anrop.init.body, 'string');
  return JSON.parse(anrop.init.body);
}

test('byggSchema stänger objektet och räknar upp de nio fälten', () => {
  const schema = byggSchema(ETIKETTER, ['bidra']);
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.required, ['avsikt', 'omrade', 'erbjuder', 'typ', 'plats', 'sokord', 'faq', 'manniska', 'tolkning']);
  assert.deepEqual(schema.properties.omrade.items.enum, ['halsa']);
  assert.equal(schema.properties.sokord.maxItems, 2);
});

test('tom faq-lista blir en array som inte rymmer något', () => {
  const schema = byggSchema(ETIKETTER, []);
  assert.deepEqual(schema.properties.faq, { type: 'array', maxItems: 0 });
});

test('arModellsvar godkänner ett giltigt svar', () => {
  assert.equal(arModellsvar(GILTIGT, ETIKETTER, ['bidra']), true);
});

test('arModellsvar avvisar värden utanför schemat', () => {
  const fall = [
    [{ ...GILTIGT, omrade: ['finns-inte'] }, 'okänt område'],
    [{ ...GILTIGT, extra: true }, 'extra nyckel'],
    [{ ...GILTIGT, sokord: ['a', 'b', 'c'] }, 'tre sökord'],
    [{ ...GILTIGT, tolkning: 'x'.repeat(201) }, 'för lång tolkning'],
    [{ ...GILTIGT, avsikt: 'annat' }, 'okänd avsikt'],
    [null, 'null'],
  ];
  for (const [varde, namn] of fall) {
    assert.equal(arModellsvar(varde, ETIKETTER, ['bidra']), false, namn);
  }
});

test('systemprompten är likadan mellan anrop och saknar datum', () => {
  const text = systemprompt(ETIKETTER, FAQ);
  assert.equal(text, systemprompt(ETIKETTER, FAQ));
  assert.ok(text.includes('halsa: Hälsa och life science'));
  assert.ok(text.includes('bidra:'));
  assert.equal(/\d{4}-\d{2}-\d{2}/.test(text), false);
});

test('byggMeddelanden lägger historiken mellan system och den nya frågan', () => {
  const filter = { q: 'röst', erbjuder: [], typ: [], omrade: ['halsa'], lan: '', kommun: '' };
  const meddelanden = byggMeddelanden('regler', 'bara i Göteborg', [{ fraga: 'hälsa', filter }]);
  assert.deepEqual(meddelanden.map((m) => m.role), ['system', 'user', 'assistant', 'user']);
  assert.equal(meddelanden[0].content, 'regler');
  assert.equal(meddelanden[1].content, 'hälsa');
  assert.equal(meddelanden[2].content, JSON.stringify(filter));
  assert.equal(meddelanden[3].content, 'bara i Göteborg');
});

test('anropets kropp och huvuden följer schemat', async () => {
  const e = {
    omraden: { halsa: 'Hälsa och life science' },
    erbjuder: { infrastruktur: 'Infrastruktur och hosting' },
    typer: { bolag: 'Bolag' },
    typerPlural: { bolag: 'Bolag' },
    lan: {},
  };
  const faq = [{ id: 'bidra', fragor: ['Hur lägger jag till mitt bolag?'] }];
  const { anrop, fn } = falskHamta(JSON.stringify(GILTIGT));
  const tolkare = skapaTolkare({ ...INST, modell: 'google/gemma' }, e, faq, fn);
  e.omraden.extra = 'Ska inte med';
  faq.push({ id: 'ny', fragor: ['ny fråga'] });
  const filter = { q: 'röst', erbjuder: [], typ: [], omrade: ['halsa'], lan: '', kommun: '' };
  await tolkare('och hosting', [{ fraga: 'hälsa', filter }]);
  assert.equal(anrop.length, 1);
  assert.equal(anrop[0].url, 'https://api.example/v1/chat/completions');
  assert.equal(anrop[0].init.method, 'POST');
  assert.equal(anrop[0].init.headers.authorization, 'Bearer hemlig');
  assert.equal(anrop[0].init.headers['content-type'], 'application/json');
  const kropp = kroppAv(anrop[0]);
  assert.equal(kropp.temperature, 0);
  assert.equal(kropp.max_tokens, 400);
  assert.equal(kropp.model, 'google/gemma');
  assert.equal(kropp.response_format.type, 'json_schema');
  assert.equal(kropp.response_format.json_schema.strict, true);
  assert.equal(kropp.response_format.json_schema.name, 'tolkning');
  assert.deepEqual(kropp.response_format.json_schema.schema.properties.omrade.items.enum, ['halsa']);
  assert.equal(kropp.messages[0].content.includes('Ska inte med'), false);
  assert.equal(kropp.messages[0].content.includes('ny fråga'), false);
  assert.deepEqual(kropp.messages.map((m) => m.role), ['system', 'user', 'assistant', 'user']);
  assert.equal(kropp.messages[2].content, JSON.stringify(filter));
  assert.equal(kropp.messages[3].content, 'och hosting');
});

test('ett giltigt svar ges efter ett anrop', async () => {
  const { anrop, fn } = falskHamta(JSON.stringify(GILTIGT));
  const tolkare = skapaTolkare(INST, ETIKETTER, FAQ, fn);
  assert.deepEqual(await tolkare('röst i Göteborg', []), GILTIGT);
  assert.equal(anrop.length, 1);
});

test('ogiltig JSON första gången och ett giltigt svar andra gången', async () => {
  const { anrop, fn } = falskHamta(['{inte', JSON.stringify(GILTIGT)]);
  const tolkare = skapaTolkare(INST, ETIKETTER, FAQ, fn);
  assert.deepEqual(await tolkare('röst i Göteborg', []), GILTIGT);
  assert.equal(anrop.length, 2);
});

test('ogiltig JSON båda gångerna ger felet ogiltig', async () => {
  const { anrop, fn } = falskHamta('{inte');
  const tolkare = skapaTolkare(INST, ETIKETTER, FAQ, fn);
  assert.equal(await felnamn(tolkare('röst i Göteborg', [])), 'ogiltig');
  assert.equal(anrop.length, 2);
});

test('svar utanför schemat båda gångerna ger felet ogiltig', async () => {
  const { anrop, fn } = falskHamta(JSON.stringify({ ...GILTIGT, omrade: ['finns-inte'] }));
  const tolkare = skapaTolkare(INST, ETIKETTER, FAQ, fn);
  assert.equal(await felnamn(tolkare('röst i Göteborg', [])), 'ogiltig');
  assert.equal(anrop.length, 2);
});

test('HTTP 500 ger felet nere utan nytt försök', async () => {
  const { anrop, fn } = falskHamta(JSON.stringify(GILTIGT), 500);
  const tolkare = skapaTolkare(INST, ETIKETTER, FAQ, fn);
  assert.equal(await felnamn(tolkare('röst i Göteborg', [])), 'nere');
  assert.equal(anrop.length, 1);
});

test('ett anrop som aldrig svarar ger felet tidsgrans inom tidsgränsen', { timeout: 2000 }, async () => {
  const fn = (_url, init) => new Promise((_resolve, reject) => {
    const signal = init?.signal;
    if (!signal) return;
    signal.addEventListener('abort', () => {
      reject(new DOMException('The operation was aborted', 'AbortError'));
    });
  });
  const tolkare = skapaTolkare({ ...INST, tidsgrans: 100 }, ETIKETTER, FAQ, fn);
  const start = Date.now();
  assert.equal(await felnamn(tolkare('röst i Göteborg', [])), 'tidsgrans');
  assert.ok(Date.now() - start < 400);
});

test('ett nätverksfel ger felet nere', async () => {
  const fn = async () => {
    throw new Error('nätverk');
  };
  const tolkare = skapaTolkare(INST, ETIKETTER, FAQ, fn);
  assert.equal(await felnamn(tolkare('röst i Göteborg', [])), 'nere');
});

test('tolkaren anropar aldrig console', async () => {
  const fangat = [];
  const original = { log: console.log, error: console.error, warn: console.warn, info: console.info };
  for (const nyckel of Object.keys(original)) console[nyckel] = (...args) => fangat.push(args);
  try {
    const { fn } = falskHamta(JSON.stringify(GILTIGT));
    await skapaTolkare(INST, ETIKETTER, FAQ, fn)('Hemlig fråga om röst', []);
    const kast = async () => {
      throw new Error('Hemlig fråga om röst');
    };
    await felnamn(skapaTolkare(INST, ETIKETTER, FAQ, kast)('Hemlig fråga om röst', []));
    assert.equal(fangat.length, 0);
  } finally {
    Object.assign(console, original);
  }
});

test('slut på krediter och fel nyckel får egna namn, utan nytt försök', async () => {
  const fel = (status, kropp) => {
    const anrop = [];
    return { anrop, fn: async (url, init) => { anrop.push({ url, init }); return new Response(kropp, { status }); } };
  };
  const slut = fel(402, JSON.stringify({ error: { code: 'payment_required', message: 'Out of credits' } }));
  assert.equal(await felnamn(skapaTolkare(INST, ETIKETTER, FAQ, slut.fn)('röst', [])), 'slut');
  assert.equal(slut.anrop.length, 1);
  const nyckel = fel(401, JSON.stringify({ error: { code: 'invalid_api_key', type: 'authentication_error' } }));
  assert.equal(await felnamn(skapaTolkare(INST, ETIKETTER, FAQ, nyckel.fn)('röst', [])), 'nyckel');
});

test('felsort känner igen slut på krediter i flera former', () => {
  assert.equal(felsort(402, ''), 'slut');
  assert.equal(felsort(429, JSON.stringify({ error: { code: 'insufficient_quota' } })), 'slut');
  assert.equal(felsort(429, JSON.stringify({ error: { message: 'You have run out of credits' } })), 'slut');
  assert.equal(felsort(403, JSON.stringify({ error: { type: 'billing_error', message: 'Insufficient balance' } })), 'slut');
  assert.equal(felsort(429, JSON.stringify({ error: { message: 'Rate limit exceeded' } })), 'begransad');
  assert.equal(felsort(401, ''), 'nyckel');
  assert.equal(felsort(403, 'Forbidden'), 'nyckel');
  assert.equal(felsort(500, ''), 'nere');
  assert.equal(felsort(503, '<html>'), 'nere');
  assert.equal(felsort(400, ''), 'ogiltig');
});

test('felsort känner igen en modell som inte finns', () => {
  const modell = 'mistralai/Mistral-Small-3.2-24B-Instruct-2506';
  assert.equal(felsort(404, ''), 'modell');
  assert.equal(felsort(404, '<html><body>Not Found</body></html>'), 'modell');
  assert.equal(felsort(404, JSON.stringify({ error: { message: 'The model `x` does not exist', code: 'model_not_found' } }), modell), 'modell');
  assert.equal(felsort(400, JSON.stringify({ error: { message: `Invalid model name passed in model=${modell}` } }), modell), 'modell');
  assert.equal(felsort(400, JSON.stringify({ error: { message: 'Unknown model', type: 'invalid_request_error', param: 'model' } }), modell), 'modell');
  assert.equal(felsort(400, JSON.stringify({ error: { code: 'model_not_found' } })), 'modell');
  // En 400 som bara säger "model" gäller det här anropet, inte modellen.
  assert.equal(felsort(400, JSON.stringify({ error: { message: "This model's maximum context length is 32768 tokens" } }), modell), 'ogiltig');
  assert.equal(felsort(400, '', modell), 'ogiltig');
  // Ett tomt modellnamn finns i varje text. Det får inte göra varje 400 till en saknad modell.
  assert.equal(felsort(400, 'Bad Request', ''), 'ogiltig');
});

test('en modell som inte finns får eget namn, utan nytt försök', async () => {
  const anrop = [];
  const fn = async (url, init) => {
    anrop.push({ url, init });
    return new Response(JSON.stringify({ error: { message: `The model \`${INST.modell}\` does not exist.` } }), { status: 404 });
  };
  assert.equal(await felnamn(skapaTolkare(INST, ETIKETTER, FAQ, fn)('röst', [])), 'modell');
  assert.equal(anrop.length, 1);
  const fyrahundra = [];
  const fn400 = async (url, init) => {
    fyrahundra.push({ url, init });
    return new Response(JSON.stringify({ error: { message: `Invalid model name passed in model=${INST.modell}` } }), { status: 400 });
  };
  assert.equal(await felnamn(skapaTolkare(INST, ETIKETTER, FAQ, fn400)('röst', [])), 'modell');
  assert.equal(fyrahundra.length, 1);
});

test('systemprompten säger att bara det besökaren nämner blir filter', () => {
  const text = systemprompt(ETIKETTER, FAQ);
  assert.match(text, /nämner/);
  assert.match(text, /generell/);
  assert.match(text, /verb/);
});
