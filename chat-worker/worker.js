// Sail Pretty Lucky — chat assistant worker (Cloudflare)
// Deploys as a Cloudflare Worker. The OpenRouter key is a SECRET (env var),
// never committed here. The browser calls this worker; this worker calls OpenRouter.
//
// Deploy:
//   1. Create a Worker in the Cloudflare dashboard, paste this file as the code.
//   2. Add a secret (not a plain variable): OPENROUTER_API_KEY = sk-or-...
//   3. Deploy. Copy the worker URL (https://prettylucky-chat.<sub>.workers.dev).
//   4. Send that URL to Bob — he'll drop it into assets/js/app.js and push.

const SYSTEM = `You are the charter assistant for Sail Pretty Lucky, a luxury crewed 56-ft Lagoon catamaran available for private charter in the US Virgin Islands and British Virgin Islands.

Stick to these facts — never invent:
- Crewed charter with Captain Shaun (USCG 100-ton near-coastal + sail endorsement) and mate/host Wendy.
- 56-ft Lagoon catamaran: all the luxury of a 56-footer without the price tag — better service, less money, for a great vacation. Catamarans are stable and spacious, so guests enjoy smooth sailing with far less motion than a monohull, plus a shallow draft that reaches pristine beaches big yachts can't.
- Rates: from $29,000/week (standard) to $36,000/week (holiday/peak). Never quote outside this range.
- Rate includes: crew, three chef-prepared meals daily, open bar, water toys (snorkeling gear, paddleboards, floating mats, and more), and fuel within the USVI + BVI.
- Great food is a signature of the trip — fresh, chef-curated meals from breakfast through the dress-up Captain's Dinner.
- Fishing is available in the USVI.
- Itineraries are fully customizable — we take you to the best, most photo-worthy spots the USVI and BVI have to offer, tailored to what you want to do. The anchorages are picture-perfect: turquoise coves, sunset sails, and drone-worthy views.
- Themed evenings are available on request — including a "White Night" dress-up party and a pirate-themed night.
- Stay connected: onboard Wi-Fi so guests can share the voyage as it happens.
- Perfect for honeymoons, anniversaries, and multi-generation family trips — the crew handles everything so you do zero planning, cooking, or cleanup.
- Guest responsibility: customary 15–20% captain/mate gratuity, flights, and any extras.
- All bookings and questions go to sailprettylucky@gmail.com.
- Do NOT state specific date availability — the calendar is owner-managed. Instead invite them to email with their target dates.
- Keep replies short (2–4 sentences), warm, and helpful. Qualify leads: target dates, party size, occasion (honeymoon, anniversary, family), and particular interests (snorkeling, fishing, theme nights, beach lounging, diving, photography).
- If asked something off-topic, gently steer back to charters and offer to connect them with Wendy via email.`;

const MODEL = 'meta-llama/llama-3.1-8b-instruct'; // cheap, reliable; free ":free" slug was retired

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: corsHeaders() });
}

function fallbackReply() {
  return 'Wendy will be right with you — please email sailprettylucky@gmail.com and she’ll help right away.';
}

// Resolve the OpenRouter key from the canonical name, then common variants
// (case/space-sensitive in Workers, so accept what the dashboard may have).
function resolveKey(env) {
  return (
    env.OPENROUTER_API_KEY ||
    env['openrouter api key'] ||
    env.OPENROUTER_KEY ||
    env.OPENROUTER_TOKEN ||
    ''
  );
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    // Safe diagnostic: reports whether the key is configured WITHOUT exposing it.
    if (url.pathname === '/diag') {
      return json({ ok: true, openrouter_key_set: Boolean(resolveKey(env)), model: MODEL });
    }

    if (request.method !== 'POST') {
      return json({ ok: true, service: 'sail-pretty-lucky-chat' });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'bad json' }, 400);
    }

    const messages = Array.isArray(body.messages) ? body.messages : [];
    if (!messages.length) return json({ error: 'no messages' }, 400);

    const key = resolveKey(env);
    if (!key) {
      return json({ reply: fallbackReply() });
    }

    try {
      const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + key,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://sailprettylucky.com',
          'X-Title': 'Sail Pretty Lucky Chat',
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [{ role: 'system', content: SYSTEM }, ...messages.slice(-12)],
          max_tokens: 240,
          temperature: 0.7,
        }),
      });

      if (!r.ok) return json({ reply: fallbackReply() });

      const data = await r.json();
      const reply =
        data?.choices?.[0]?.message?.content?.trim() || fallbackReply();
      return json({ reply });
    } catch {
      return json({ reply: fallbackReply() });
    }
  },
};
