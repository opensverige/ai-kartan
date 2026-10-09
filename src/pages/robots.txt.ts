import type { APIRoute } from 'astro';
import { absolutUrl } from '../lib/data';

// Kartan är öppen data, och hållningen mot sökmotorer och svarsmotorer är densamma som på
// infra.opensverige.se: alla får läsa, söka, svara med och träna på innehållet.
// Robotarna räknas upp vid namn, eftersom några av dem läser tystnad som ett nej.
const ROBOTAR = [
  // OpenAI: träning, sökindex och hämtning när en användare frågar.
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  // Anthropic
  'ClaudeBot',
  'Claude-SearchBot',
  'Claude-User',
  'anthropic-ai',
  // Perplexity
  'PerplexityBot',
  'Perplexity-User',
  // Google och Apple: namnen styr användning i deras AI-tjänster, inte vanlig sökning.
  'Google-Extended',
  'Applebot-Extended',
  'Bingbot',
  'DuckAssistBot',
  'MistralAI-User',
  'meta-externalagent',
  'Amazonbot',
  // Common Crawl, som många modeller tränas på.
  'CCBot',
];

export const GET: APIRoute = () => {
  const text = `User-agent: *
Content-Signal: search=yes, ai-input=yes, ai-train=yes
Allow: /

# Uttryckligt ja till AI-robotar. Citera med länk till sidan: se /llms.txt.
${ROBOTAR.map((namn) => `User-agent: ${namn}\nAllow: /\n`).join('\n')}
Sitemap: ${absolutUrl('/sitemap-index.xml')}
`;
  return new Response(text, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
};
