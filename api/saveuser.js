// api/saveuser.js — yangi/qaytgan foydalanuvchini Supabase jadvaliga yozadi
// Kerakli env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: { message: "Faqat POST" } });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const { name, surname, birth, email, picture, lang } = body;

    if (!SB_URL || !SB_KEY) {
      // Baza ulanmagan — saytni buzmaslik uchun jim tarzda o'tkazamiz.
      return res.status(200).json({ ok: true, stored: false });
    }

    const record = {
      name: String(name || "").slice(0, 100),
      surname: String(surname || "").slice(0, 100),
      age: String(birth || "").slice(0, 40),
      email: String(email || "").slice(0, 160).toLowerCase() || null,
      picture: String(picture || "").slice(0, 500),
      lang: String(lang || "uz").slice(0, 5),
      ip: (req.headers["x-forwarded-for"] || "").split(",")[0].trim()
    };

    // email bo'yicha upsert: mavjud bo'lsa yangilanadi, bo'lmasa qo'shiladi
    const r = await fetch(SB_URL + "/rest/v1/studyai_users?on_conflict=email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SB_KEY,
        "Authorization": "Bearer " + SB_KEY,
        "Prefer": "resolution=merge-duplicates,return=minimal"
      },
      body: JSON.stringify(record)
    });

    if (!r.ok) {
      const errText = await r.text();
      return res.status(200).json({ ok: true, stored: false, warn: errText.slice(0, 200) });
    }

    return res.status(200).json({ ok: true, stored: true });
  } catch (err) {
    return res.status(200).json({ error: { message: err.message } });
  }
}
