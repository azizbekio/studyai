// api/log.js — foydalanuvchi faoliyatini (chat, test, vazifa) Supabase'ga yozadi
const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Faqat POST" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const { email, type, detail } = body;
    if (!type) return res.status(200).json({ ok: true, stored: false });
    if (!SB_URL || !SB_KEY) return res.status(200).json({ ok: true, stored: false });

    await fetch(SB_URL + "/rest/v1/studyai_activity", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SB_KEY,
        "Authorization": "Bearer " + SB_KEY,
        "Prefer": "return=minimal"
      },
      body: JSON.stringify({
        email: String(email || "").slice(0, 160).toLowerCase() || null,
        type: String(type).slice(0, 60),
        detail: String(detail || "").slice(0, 500)
      })
    });

    return res.status(200).json({ ok: true, stored: true });
  } catch (err) {
    return res.status(200).json({ error: err.message });
  }
}
