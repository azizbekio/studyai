// api/chat.js — StudyAI AI endpoint (Groq), Edge runtime
// Ikki rejim: stream:true -> SSE oqim (javob so'zma-so'z keladi), aks holda oddiy JSON.
export const config = { runtime: 'edge' };

const MODELS = [
  "openai/gpt-oss-20b",   // tez — chat, kundalik jadval
  "openai/gpt-oss-120b",  // kuchli — reja, test tuzish
  "qwen/qwen3.6-27b"      // zaxira
];
const URL_GROQ = "https://api.groq.com/openai/v1/chat/completions";

const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
  status, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
});

export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: {
    "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" } });
  if (req.method !== "POST") return json({ error: { message: "Faqat POST" } }, 405);

  const key = process.env.GROQ_API_KEY;
  if (!key) return json({ error: { message: "GROQ_API_KEY topilmadi. Vercel > Settings > Environment Variables." } });

  let body = {};
  try { body = await req.json(); } catch (e) { return json({ error: { message: "Noto'g'ri so'rov" } }); }

  const { prompt, messages, system, model, max_tokens, temperature, stream, json_mode } = body;

  let msgs = Array.isArray(messages) && messages.length
    ? messages.filter(m => m && m.content).map(m => ({ role: m.role === 'assistant' ? 'assistant' : m.role === 'system' ? 'system' : 'user', content: String(m.content).slice(0, 8000) }))
    : [{ role: "user", content: String(prompt || "").slice(0, 8000) }];
  if (system) msgs = [{ role: "system", content: String(system).slice(0, 4000) }, ...msgs];
  if (!msgs.length) return json({ error: { message: "Bo'sh so'rov" } });

  const chain = [...new Set([model, process.env.GROQ_MODEL, ...MODELS].filter(Boolean))];
  let lastError = "Noma'lum xato";

  for (const m of chain) {
    const payload = {
      model: m,
      messages: msgs,
      max_tokens: Math.min(Number(max_tokens) || 1400, 8000),
      temperature: typeof temperature === "number" ? temperature : 0.7,
      stream: !!stream
    };
    if (json_mode) payload.response_format = { type: "json_object" };

    let r;
    try {
      r = await fetch(URL_GROQ, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key },
        body: JSON.stringify(payload)
      });
    } catch (e) { lastError = e.message; continue; }

    if (!r.ok) {
      let msg = "HTTP " + r.status;
      try { const e = await r.json(); msg = e?.error?.message || msg; } catch (_) {}
      lastError = msg;
      if (/model|decommission|does not exist|not found|access/i.test(msg)) continue; // keyingi model
      if (r.status === 429) lastError = "Limit tugadi. Bir necha daqiqadan keyin urinib ko'ring.";
      break;
    }

    if (stream) {
      return new Response(r.body, { headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Model": m,
        "Access-Control-Allow-Origin": "*"
      }});
    }

    const data = await r.json();
    return json({ ok: true, model: m, text: data.choices?.[0]?.message?.content || "", usage: data.usage, choices: data.choices });
  }

  return json({ error: { message: lastError } });
}
