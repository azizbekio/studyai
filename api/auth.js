// api/auth.js — Google ID token'ni tekshiradi va foydalanuvchi ma'lumotini qaytaradi
const CLIENT_ID = "189889097085-7onj5aki0q7karkvj7l4ce0gkkl63rhp.apps.googleusercontent.com";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Faqat POST" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const token = body.token;
    if (!token) return res.status(200).json({ error: "Token yo'q" });

    // Google'ning o'zidan tokenni tekshirtiramiz — bu ishonchli va kutubxonasiz ishlaydi
    const r = await fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(token));
    const data = await r.json();

    if (!r.ok || data.error) {
      return res.status(200).json({ error: "Token yaroqsiz: " + (data.error_description || data.error || "noma'lum") });
    }
    if (data.aud !== CLIENT_ID) {
      return res.status(200).json({ error: "Token boshqa ilovaga tegishli" });
    }

    return res.status(200).json({
      email: data.email || "",
      email_verified: data.email_verified === "true" || data.email_verified === true,
      name: data.name || "",
      given_name: data.given_name || "",
      picture: data.picture || ""
    });
  } catch (err) {
    return res.status(200).json({ error: err.message });
  }
}
