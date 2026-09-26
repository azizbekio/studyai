/* ============================================================
   /api/profile.js — profil: bio + avatar (rasm)
   QAYERGA: api/ papkasiga yangi fayl, nomi: profile.js

   GET  /api/profile?username=azizbek_a   -> ochiq profil (email QAYTMAYDI)
   POST /api/profile {email, bio, avatar} -> o'z profilini yangilash

   avatar — bu "data:image/jpeg;base64,..." ko'rinishidagi KICHIK rasm.
   Brauzerda canvas orqali 256x256 ga kichraytiriladi, shuning uchun
   ~15 KB atrofida bo'ladi. Katta fayl serverda rad etiladi.

   Kerakli env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
============================================================ */

const { requireUser } = require('./_session');
const { guard } = require('./_ratelimit');

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SCORES = 'studyai_scores';
const MAX_AVATAR = 120000;   // ~120 KB, base64 holida

async function sb(path, opts) {
  opts = opts || {};
  const headers = Object.assign({
    apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json'
  }, opts.headers || {});
  const r = await fetch(SB_URL + '/rest/v1/' + path, {
    method: opts.method || 'GET', headers: headers, body: opts.body
  });
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
  if (!r.ok) {
    const msg = (data && data.message) ? data.message : ('Supabase xatosi (' + r.status + ')');
    throw new Error(msg);
  }
  return data;
}

function readBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch (e) { return {}; } }
  return req.body;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (!SB_URL || !SB_KEY) throw new Error('SUPABASE_URL yoki SUPABASE_SERVICE_ROLE_KEY sozlanmagan');

    /* ---------- SAQLASH ---------- */
    if (req.method === 'POST') {
      const who = requireUser(req, res);
      if (!who) return;
      if (!guard(res, 'profile:' + who.email, 10, 60000)) return;
      const b = readBody(req);
      const email = who.email;

      const row = { email: email, updated_at: new Date().toISOString() };

      if (typeof b.bio === 'string') row.bio = b.bio.trim().slice(0, 160);

      if (typeof b.avatar === 'string' && b.avatar) {
        if (!/^data:image\/(png|jpeg|jpg|webp);base64,/.test(b.avatar)) {
          return res.status(400).json({ error: { message: 'Rasm formati noto\'g\'ri' } });
        }
        if (b.avatar.length > MAX_AVATAR) {
          return res.status(413).json({ error: { message: 'Rasm juda katta. Kichikroq rasm tanlang.' } });
        }
        row.avatar = b.avatar;
      }
      if (b.avatar === null) row.avatar = null;   // rasmni o'chirish

      await sb(SCORES + '?on_conflict=email', {
        method: 'POST',
        body: JSON.stringify(row),
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }
      });

      return res.status(200).json({ ok: true });
    }

    /* ---------- OCHIQ PROFILNI O'QISH ---------- */
    const username = String((req.query || {}).username || '').trim().toLowerCase();
    const cols = 'name,username,bio,avatar,picture,xp,level,streak,coins,club,club_role,quizzes,tasks_done';

    let rows;
    if (username) {
      rows = await sb(SCORES + '?select=' + cols + '&username=eq.' + encodeURIComponent(username));
    } else {
      /* username berilmagan -> "mening profilim". Kim ekanini
         sessiyadan bilamiz, shuning uchun email so'ramaymiz. */
      const who = requireUser(req, res);
      if (!who) return;
      rows = await sb(SCORES + '?select=' + cols + '&email=eq.' + encodeURIComponent(who.email));
      if (!rows || !rows[0]) return res.status(200).json({ profile: null });
    }

    const u = rows && rows[0];
    if (!u) return res.status(404).json({ error: { message: 'Foydalanuvchi topilmadi' } });

    let clubName = '';
    if (u.club) {
      const c = await sb('studyai_clubs?select=name&code=eq.' + encodeURIComponent(u.club));
      clubName = (c && c[0] && c[0].name) || '';
    }

    /* DIQQAT: email hech qachon qaytarilmaydi — bu maxfiylik qoidasi. */
    return res.status(200).json({
      profile: {
        name: u.name || '',
        username: u.username || '',
        bio: u.bio || '',
        avatar: u.avatar || '',   // Google fotosi ishlatilmaydi
        xp: u.xp || 0,
        level: u.level || 1,
        streak: u.streak || 0,
        coins: u.coins || 0,
        quizzes: u.quizzes || 0,
        tasks_done: u.tasks_done || 0,
        club: u.club || null,
        clubName: clubName,
        role: u.club_role || null
      }
    });

  } catch (err) {
    return res.status(500).json({ error: { message: err.message } });
  }
};
