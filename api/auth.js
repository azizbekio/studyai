/* ============================================================
   /api/auth.js — Google ID token'ni tekshiradi, SESSIYA beradi
                  va oldin saqlangan profilni QAYTARADI
   QAYERGA: api/auth.js faylini shu bilan almashtiring.

   Nima o'zgardi:
   1. Endi javobda `session` bor — imzolangan chipta (30 kun).
      Brauzer uni saqlaydi va har so'rovda yuboradi.
   2. Endi javobda `profile` bor — username, bio, avatar, XP, klub.
      SHU SABABLI: chiqib qayta kirganingizda username'ni qayta
      terishingiz shart emas — server uni o'zi qaytaradi.
============================================================ */

const { createSession } = require('./_session');

const CLIENT_ID = '189889097085-7onj5aki0q7karkvj7l4ce0gkkl63rhp.apps.googleusercontent.com';
const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function sbGet(path) {
  if (!SB_URL || !SB_KEY) return null;
  const r = await fetch(SB_URL + '/rest/v1/' + path, {
    headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY }
  });
  if (!r.ok) return null;
  try { return await r.json(); } catch (e) { return null; }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Session');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Faqat POST' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const token = body.token;
    if (!token) return res.status(200).json({ error: 'Token yo\'q' });

    /* Google'ning o'zidan tekshirtiramiz — kutubxonasiz va ishonchli */
    const r = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(token));
    const data = await r.json();

    if (!r.ok || data.error) {
      return res.status(200).json({ error: 'Token yaroqsiz: ' + (data.error_description || data.error || 'noma\'lum') });
    }
    /* aud — token AYNAN bizning ilovamiz uchun berilganmi?
       Bu tekshiruvsiz boshqa saytning tokeni ham o'tib ketardi. */
    if (data.aud !== CLIENT_ID) {
      return res.status(200).json({ error: 'Token boshqa ilovaga tegishli' });
    }
    /* Tasdiqlanmagan email bilan hisob ochishga yo'l qo'ymaymiz */
    const verified = data.email_verified === 'true' || data.email_verified === true;
    if (!verified) {
      return res.status(200).json({ error: 'Email tasdiqlanmagan' });
    }

    const email = String(data.email || '').toLowerCase();
    const user = { email: email, name: data.name || '', picture: data.picture || '' };

    /* Oldin saqlangan profil (bor bo'lsa) */
    let profile = null;
    const rows = await sbGet('studyai_scores?select=username,bio,avatar,name,xp,level,coins,streak,club,club_role&email=eq.' + encodeURIComponent(email));
    if (rows && rows[0]) {
      const u = rows[0];
      profile = {
        username: u.username || '',
        bio: u.bio || '',
        avatar: u.avatar || '',
        name: u.name || '',
        xp: u.xp || 0,
        level: u.level || 1,
        coins: u.coins || 0,
        streak: u.streak || 0,
        club: u.club || null,
        role: u.club_role || null,
        returning: !!u.username          // eski foydalanuvchimi?
      };
    }

    return res.status(200).json({
      email: email,
      email_verified: true,
      name: data.name || '',
      given_name: data.given_name || '',
      picture: data.picture || '',
      session: createSession(user),
      profile: profile
    });
  } catch (err) {
    return res.status(200).json({ error: err.message });
  }
};
