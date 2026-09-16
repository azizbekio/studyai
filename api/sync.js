// api/sync.js — bulutli zaxira (Upstash Redis REST orqali)
// Vercel env: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
// GET  /api/sync?email=...   -> saqlangan ma'lumot
// POST /api/sync  {email, data} -> saqlaydi
// Eslatma: bu oddiy zaxira. Ishonchli auth kerak bo'lsa, Google ID tokenni
// serverda tekshiring (api/auth.js dagi kabi) va email'ni tokendan oling.

const U = process.env.UPSTASH_REDIS_REST_URL;
const T = process.env.UPSTASH_REDIS_REST_TOKEN;

async function redis(cmd) {
  const r = await fetch(U + "/" + cmd.map(encodeURIComponent).join("/"), {
    headers: { Authorization: "Bearer " + T }
  });
  return r.json();
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (!U || !T) return res.status(200).json({ error: { message: "Sinxronizatsiya sozlanmagan (Upstash env yo'q)." } });

  try {
    if (req.method === "GET") {
      const email = String(req.query.email || "").toLowerCase();
      if (!email) return res.status(200).json({ error: { message: "email kerak" } });
      const out = await redis(["GET", "studyai:" + email]);
      return res.status(200).json({ ok: true, data: out.result ? JSON.parse(out.result) : null });
    }

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
      const email = String(body.email || "").toLowerCase();
      if (!email || !body.data) return res.status(200).json({ error: { message: "email va data kerak" } });

      const payload = JSON.stringify({ ...body.data, updated: Date.now() });
      if (payload.length > 900000) return res.status(200).json({ error: { message: "Ma'lumot juda katta" } });

      // SET key value EX 15552000 (180 kun)
      await fetch(U + "/set/" + encodeURIComponent("studyai:" + email) + "?EX=15552000", {
        method: "POST",
        headers: { Authorization: "Bearer " + T, "Content-Type": "application/json" },
        body: payload
      });
      return res.status(200).json({ ok: true, updated: Date.now() });
    }

    return res.status(405).json({ error: { message: "Faqat GET/POST" } });
  } catch (e) {
    return res.status(200).json({ error: { message: e.message } });
  }
}
