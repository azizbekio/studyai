// api/admin.js — Supabase'dagi foydalanuvchilar ro'yxatini qaytaradi
// Himoya 1: ?key=... parametri ADMIN_KEY env bilan mos kelishi shart.
// Himoya 2: bitta IP manzil 5 marta xato parol tersa, 10 daqiqaga bloklanadi.

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MAX_FAILS = 5;
const LOCK_MINUTES = 10;

async function sb(path, opts) {
  const r = await fetch(SB_URL + path, {
    ...opts,
    headers: { "apikey": SB_KEY, "Authorization": "Bearer " + SB_KEY, "Content-Type": "application/json", ...(opts && opts.headers) }
  });
  return r;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "GET") return res.status(405).json({ error: { message: "Faqat GET" } });
  if (!SB_URL || !SB_KEY) return res.status(200).json({ error: { message: "Baza ulanmagan (Supabase env yo'q)" } });

  const ip = (req.headers["x-forwarded-for"] || "unknown").split(",")[0].trim();
  const key = req.query.key;

  try {
    // Joriy holatni tekshirish
    const cur = await sb("/rest/v1/studyai_admin_attempts?ip=eq." + encodeURIComponent(ip) + "&select=*").then(r => r.json());
    const row = Array.isArray(cur) && cur[0];

    if (row && row.locked_until && new Date(row.locked_until) > new Date()) {
      const minsLeft = Math.ceil((new Date(row.locked_until) - new Date()) / 60000);
      return res.status(429).json({ error: { message: "Juda ko'p xato urinish. " + minsLeft + " daqiqadan keyin qayta urining." } });
    }

    if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) {
      const fails = (row ? row.fail_count : 0) + 1;
      const locked = fails >= MAX_FAILS;
      await sb("/rest/v1/studyai_admin_attempts?on_conflict=ip", {
        method: "POST",
        headers: { "Prefer": "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({
          ip, fail_count: locked ? 0 : fails,
          locked_until: locked ? new Date(Date.now() + LOCK_MINUTES * 60000).toISOString() : null
        })
      });
      return res.status(401).json({ error: { message: locked ? "Juda ko'p xato urinish. " + LOCK_MINUTES + " daqiqaga bloklandi." : "Ruxsat yo'q" } });
    }

    // To'g'ri parol — urinishlar hisobini tozalaymiz
    if (row) {
      await sb("/rest/v1/studyai_admin_attempts?ip=eq." + encodeURIComponent(ip), { method: "DELETE" });
    }

    const r = await sb("/rest/v1/studyai_users?select=*&order=signed_up_at.desc");
    if (!r.ok) {
      const errText = await r.text();
      return res.status(200).json({ error: { message: errText.slice(0, 300) } });
    }
    const users = await r.json();
    return res.status(200).json({ ok: true, total: users.length, users });
  } catch (err) {
    return res.status(200).json({ error: { message: err.message } });
  }
}
