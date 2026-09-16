// api/chat.js — StudyAI AI endpoint (Groq)
// Eski "llama-3.1-8b-instant" model 2026-08-16 da o'chirilgan.
// Endi bir nechta model ketma-ket sinaladi: biri ishlamasa, keyingisiga o'tadi.

const FALLBACK_MODELS = [
  "openai/gpt-oss-20b",     // tez, arzon — kundalik chat uchun
  "openai/gpt-oss-120b",    // kuchliroq — reja va tahlil uchun
  "qwen/qwen3.6-27b"        // zaxira
];

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: { message: "Faqat POST" } });

  if (!process.env.GROQ_API_KEY) {
    return res.status(200).json({ error: { message: "GROQ_API_KEY topilmadi. Vercel > Settings > Environment Variables ga qo'shing." } });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const { prompt, messages, system, model, max_tokens, temperature } = body;

    let msgs = Array.isArray(messages) && messages.length
      ? messages
      : [{ role: "user", content: String(prompt || "") }];

    if (system) msgs = [{ role: "system", content: String(system) }, ...msgs];
    if (!msgs.length || !msgs[msgs.length - 1].content) {
      return res.status(200).json({ error: { message: "Bo'sh so'rov" } });
    }

    // Model tartibi: so'rovdagi > env dagi > standart ro'yxat
    const preferred = [model, process.env.GROQ_MODEL].filter(Boolean);
    const chain = [...new Set([...preferred, ...FALLBACK_MODELS])];

    let lastError = "Nomaʼlum xato";

    for (const m of chain) {
      try {
        const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + process.env.GROQ_API_KEY
          },
          body: JSON.stringify({
            model: m,
            messages: msgs,
            max_tokens: Math.min(Number(max_tokens) || 1400, 4096),
            temperature: typeof temperature === "number" ? temperature : 0.7
          })
        });

        const data = await r.json();

        if (!r.ok || data.error) {
          lastError = (data.error && data.error.message) || ("HTTP " + r.status);
          // Model muammosi bo'lsa — keyingi modelni sinaymiz
          if (/model|decommission|does not exist|not found|access/i.test(lastError)) continue;
          // Limit yoki server muammosi — qaytaramiz
          break;
        }

        const text = data.choices?.[0]?.message?.content || "";
        return res.status(200).json({
          ok: true,
          model: m,
          text,
          usage: data.usage,
          choices: data.choices // eski frontend bilan moslik uchun
        });
      } catch (e) {
        lastError = e.message;
      }
    }

    return res.status(200).json({ error: { message: lastError } });
  } catch (err) {
    return res.status(200).json({ error: { message: err.message } });
  }
}
